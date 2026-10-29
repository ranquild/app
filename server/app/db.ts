import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { FileEntry } from "../../shared/conversation.ts";
import type { Endpoints } from "../../shared/protocol.ts";

export type EnvironmentStatus = "creating" | "running" | "stopped" | "error" | "deleting";

export type EnvironmentCredentials = {
  email: string;
  password: string;
  apiKey: string;
  agentToken: string;
};

export type EnvironmentRow = {
  id: number;
  name: string;
  status: EnvironmentStatus;
  provisionerId: string | null;
  credentials: EnvironmentCredentials;
  endpoints: Endpoints | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DatabaseRow = {
  id: number;
  name: string;
  engine: string;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ConversationRow = {
  id: string;
  environmentId: number;
  title: string | null;
  agentConversationId: string | null;
  createdAt: string;
  updatedAt: string;
};

type SqlRow = Record<string, unknown>;

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS database (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        engine TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS environment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        provisioner_id TEXT,
        credentials TEXT NOT NULL,
        endpoints TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation (
        id TEXT PRIMARY KEY,
        environment_id INTEGER NOT NULL REFERENCES environment(id) ON DELETE CASCADE,
        title TEXT,
        agent_conversation_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entry (
        conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
        entry_key TEXT NOT NULL,
        position INTEGER NOT NULL,
        entry TEXT NOT NULL,
        PRIMARY KEY (conversation_id, entry_key)
      );
    `);
  }

  getSetting<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM setting WHERE key = ?").get(key) as SqlRow | undefined;
    return row ? (JSON.parse(String(row.value)) as T) : null;
  }

  setSetting(key: string, value: unknown) {
    if (value == null) {
      this.db.prepare("DELETE FROM setting WHERE key = ?").run(key);
      return;
    }
    this.db
      .prepare("INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  }

  listDatabases(): DatabaseRow[] {
    return (this.db.prepare("SELECT * FROM database ORDER BY id").all() as SqlRow[]).map(toDatabase);
  }

  getDatabase(id: number): DatabaseRow | null {
    const row = this.db.prepare("SELECT * FROM database WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? toDatabase(row) : null;
  }

  insertDatabase(name: string, engine: string, details: Record<string, unknown>): DatabaseRow {
    const now = new Date().toISOString();
    const result = this.db
      .prepare("INSERT INTO database (name, engine, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(name, engine, JSON.stringify(details), now, now);
    return this.getDatabase(Number(result.lastInsertRowid)) as DatabaseRow;
  }

  updateDatabase(id: number, name: string, engine: string, details: Record<string, unknown>) {
    this.db
      .prepare("UPDATE database SET name = ?, engine = ?, details = ?, updated_at = ? WHERE id = ?")
      .run(name, engine, JSON.stringify(details), new Date().toISOString(), id);
  }

  deleteDatabase(id: number) {
    this.db.prepare("DELETE FROM database WHERE id = ?").run(id);
  }

  listEnvironments(): EnvironmentRow[] {
    return (this.db.prepare("SELECT * FROM environment ORDER BY id DESC").all() as SqlRow[]).map(toEnvironment);
  }

  getEnvironment(id: number): EnvironmentRow | null {
    const row = this.db.prepare("SELECT * FROM environment WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? toEnvironment(row) : null;
  }

  getEnvironmentByName(name: string): EnvironmentRow | null {
    const row = this.db.prepare("SELECT * FROM environment WHERE name = ?").get(name) as SqlRow | undefined;
    return row ? toEnvironment(row) : null;
  }

  insertEnvironment(name: string, credentials: EnvironmentCredentials): EnvironmentRow {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO environment (name, status, credentials, created_at, updated_at) VALUES (?, 'creating', ?, ?, ?)",
      )
      .run(name, JSON.stringify(credentials), now, now);
    return this.getEnvironment(Number(result.lastInsertRowid)) as EnvironmentRow;
  }

  updateEnvironment(
    id: number,
    changes: Partial<Pick<EnvironmentRow, "status" | "provisionerId" | "endpoints" | "errorMessage">>,
  ) {
    const columns: Record<string, unknown> = {};
    if (changes.status !== undefined) {
      columns.status = changes.status;
    }
    if (changes.provisionerId !== undefined) {
      columns.provisioner_id = changes.provisionerId;
    }
    if (changes.endpoints !== undefined) {
      columns.endpoints = changes.endpoints ? JSON.stringify(changes.endpoints) : null;
    }
    if (changes.errorMessage !== undefined) {
      columns.error_message = changes.errorMessage;
    }
    columns.updated_at = new Date().toISOString();
    const keys = Object.keys(columns);
    this.db
      .prepare(`UPDATE environment SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`)
      .run(...(keys.map((key) => columns[key]) as (string | null)[]), id);
  }

  deleteEnvironment(id: number) {
    this.db.prepare("DELETE FROM environment WHERE id = ?").run(id);
  }

  listConversations(environmentId: number): ConversationRow[] {
    return (
      this.db
        .prepare("SELECT * FROM conversation WHERE environment_id = ? ORDER BY created_at DESC")
        .all(environmentId) as SqlRow[]
    ).map(toConversation);
  }

  getConversation(id: string): ConversationRow | null {
    const row = this.db.prepare("SELECT * FROM conversation WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? toConversation(row) : null;
  }

  insertConversation(id: string, environmentId: number): ConversationRow {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO conversation (id, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, environmentId, now, now);
    return this.getConversation(id) as ConversationRow;
  }

  updateConversation(id: string, changes: Partial<Pick<ConversationRow, "title" | "agentConversationId">>) {
    const columns: Record<string, unknown> = {};
    if (changes.title !== undefined) {
      columns.title = changes.title;
    }
    if (changes.agentConversationId !== undefined) {
      columns.agent_conversation_id = changes.agentConversationId;
    }
    columns.updated_at = new Date().toISOString();
    const keys = Object.keys(columns);
    this.db
      .prepare(`UPDATE conversation SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`)
      .run(...(keys.map((key) => columns[key]) as (string | null)[]), id);
  }

  deleteConversation(id: string) {
    this.db.prepare("DELETE FROM conversation WHERE id = ?").run(id);
  }

  upsertEntry(conversationId: string, entry: FileEntry) {
    const key = entry.type === "session" ? "header" : String((entry as { id?: string }).id ?? "");
    if (key === "") {
      return;
    }
    this.db
      .prepare(
        `INSERT INTO entry (conversation_id, entry_key, position, entry)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM entry WHERE conversation_id = ?), ?)
         ON CONFLICT(conversation_id, entry_key) DO UPDATE SET entry = excluded.entry`,
      )
      .run(conversationId, key, conversationId, JSON.stringify(entry));
  }

  listEntries(conversationId: string): FileEntry[] {
    const rows = this.db
      .prepare("SELECT entry_key, entry FROM entry WHERE conversation_id = ? ORDER BY position")
      .all(conversationId) as SqlRow[];
    const entries = rows.map((row) => JSON.parse(String(row.entry)) as FileEntry);
    const header = entries.filter((entry) => entry.type === "session");
    return [...header, ...entries.filter((entry) => entry.type !== "session")];
  }
}

function toDatabase(row: SqlRow): DatabaseRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    engine: String(row.engine),
    details: JSON.parse(String(row.details)) as Record<string, unknown>,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toEnvironment(row: SqlRow): EnvironmentRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    status: String(row.status) as EnvironmentStatus,
    provisionerId: row.provisioner_id == null ? null : String(row.provisioner_id),
    credentials: JSON.parse(String(row.credentials)) as EnvironmentCredentials,
    endpoints: row.endpoints == null ? null : (JSON.parse(String(row.endpoints)) as Endpoints),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toConversation(row: SqlRow): ConversationRow {
  return {
    id: String(row.id),
    environmentId: Number(row.environment_id),
    title: row.title == null ? null : String(row.title),
    agentConversationId: row.agent_conversation_id == null ? null : String(row.agent_conversation_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
