import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

import {
  type ConversationStreamEvent,
  type ConversationView,
  type JsonAgentSessionEvent,
  applyEvent,
  createView,
  messagesFromEntries,
} from "../../shared/conversation.ts";
import { HttpError, writeEvent } from "../http.ts";

import { AgentClient, UpstreamError } from "./clients.ts";
import type { ConversationRow, EnvironmentRow, Store } from "./db.ts";

const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;
const TITLE_LENGTH = 60;

type Live = {
  view: ConversationView;
  seq: number;
  subscribers: Set<ServerResponse>;
  upstream: AbortController | null;
};

export class Conversations {
  private readonly store: Store;
  private readonly live = new Map<string, Live>();

  constructor(store: Store) {
    this.store = store;
  }

  list(environmentId: number) {
    return this.store.listConversations(environmentId).map((row) => this.toJson(row));
  }

  create(environment: EnvironmentRow) {
    return this.toJson(this.store.insertConversation(randomUUID(), environment.id));
  }

  mustGet(id: string): ConversationRow {
    const row = this.store.getConversation(id);
    if (!row) {
      throw new HttpError(404, "not_found", `No conversation ${id}`);
    }
    return row;
  }

  toJson(row: ConversationRow) {
    return {
      id: row.id,
      environment_id: row.environmentId,
      title: row.title,
      state: this.live.get(row.id)?.view.running ? "running" : "idle",
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private liveOf(id: string): Live {
    let live = this.live.get(id);
    if (!live) {
      live = {
        view: createView(messagesFromEntries(this.store.listEntries(id))),
        seq: 0,
        subscribers: new Set(),
        upstream: null,
      };
      this.live.set(id, live);
    }
    return live;
  }

  messages(id: string) {
    this.mustGet(id);
    return this.liveOf(id).view.messages;
  }

  subscribe(id: string, res: ServerResponse) {
    this.mustGet(id);
    const live = this.liveOf(id);
    const snapshot: ConversationStreamEvent = { kind: "snapshot", seq: live.seq, view: live.view };
    writeEvent(res, live.seq, snapshot);
    live.subscribers.add(res);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    res.on("close", () => {
      clearInterval(heartbeat);
      live.subscribers.delete(res);
    });
  }

  private broadcast(live: Live, event: JsonAgentSessionEvent) {
    live.seq += 1;
    live.view = applyEvent(live.view, event);
    const message: ConversationStreamEvent = { kind: "event", seq: live.seq, event };
    for (const res of live.subscribers) {
      writeEvent(res, live.seq, message);
    }
  }

  private agentFor(environment: EnvironmentRow): AgentClient {
    if (environment.status !== "running" || !environment.endpoints) {
      throw new HttpError(409, "conversation_running", "Start the environment first");
    }
    return new AgentClient(environment.endpoints.agent.url, environment.credentials.agentToken);
  }

  private async openOnAgent(row: ConversationRow, agent: AgentClient): Promise<{ agentId: string; seq: number }> {
    if (row.agentConversationId) {
      try {
        const existing = await agent.get(row.agentConversationId);
        return { agentId: existing.id, seq: existing.seq };
      } catch (error) {
        if (!(error instanceof UpstreamError && error.status === 404)) {
          throw error;
        }
      }
    }
    const opened = await agent.open(this.store.listEntries(row.id));
    this.store.updateConversation(row.id, { agentConversationId: opened.id });
    return { agentId: opened.id, seq: opened.seq };
  }

  async prompt(row: ConversationRow, environment: EnvironmentRow, message: string) {
    const text = message.trim();
    if (text === "") {
      throw new HttpError(400, "bad_request", "A message is required");
    }
    const live = this.liveOf(row.id);
    if (live.view.running || live.upstream) {
      throw new HttpError(409, "conversation_running", "The agent is still working on the last message");
    }
    const agent = this.agentFor(environment);
    const { agentId, seq } = await this.openOnAgent(row, agent);
    const upstream = new AbortController();
    live.upstream = upstream;
    live.view = { ...live.view, running: true, error: null };
    const relay = this.relay(row.id, live, agent, agentId, seq, upstream);
    try {
      await agent.prompt(agentId, text);
    } catch (error) {
      upstream.abort();
      live.upstream = null;
      live.view = { ...live.view, running: false };
      await relay;
      throw error;
    }
    if (!row.title) {
      this.store.updateConversation(row.id, { title: text.slice(0, TITLE_LENGTH) });
    }
  }

  private async relay(
    id: string,
    live: Live,
    agent: AgentClient,
    agentId: string,
    startSeq: number,
    upstream: AbortController,
  ) {
    let after = startSeq;
    let attempts = 0;
    let settled = false;
    while (!settled && !upstream.signal.aborted && attempts < RECONNECT_ATTEMPTS) {
      try {
        for await (const record of agent.events(agentId, after, upstream.signal)) {
          after = record.seq;
          attempts = 0;
          if (record.kind === "entry") {
            this.store.upsertEntry(id, record.entry);
            continue;
          }
          this.broadcast(live, record.event);
          if (record.event.type === "agent_settled") {
            settled = true;
            break;
          }
        }
      } catch (error) {
        if (error instanceof UpstreamError && error.status === 404) {
          break;
        }
        process.stderr.write(`conversation ${id}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      if (!settled && !upstream.signal.aborted) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
    if (!settled && !upstream.signal.aborted) {
      live.view = { ...live.view, error: "Lost the connection to the agent" };
      this.broadcast(live, { type: "agent_settled", aborted: true } as JsonAgentSessionEvent);
    }
    if (live.upstream === upstream) {
      live.upstream = null;
    }
    upstream.abort();
  }

  async abort(row: ConversationRow, environment: EnvironmentRow) {
    if (!row.agentConversationId) {
      return;
    }
    await this.agentFor(environment).abort(row.agentConversationId);
  }

  async delete(row: ConversationRow, environment: EnvironmentRow | null) {
    const live = this.live.get(row.id);
    live?.upstream?.abort();
    for (const res of live?.subscribers ?? []) {
      res.end();
    }
    this.live.delete(row.id);
    if (environment?.status === "running" && environment.endpoints && row.agentConversationId) {
      await this.agentFor(environment)
        .close(row.agentConversationId)
        .catch(() => undefined);
    }
    this.store.deleteConversation(row.id);
  }

  stopEnvironment(environmentId: number) {
    for (const row of this.store.listConversations(environmentId)) {
      const live = this.live.get(row.id);
      if (live?.upstream) {
        live.upstream.abort();
        live.upstream = null;
        this.broadcast(live, { type: "agent_settled", aborted: true } as JsonAgentSessionEvent);
      }
    }
  }
}
