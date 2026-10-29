import { randomBytes } from "node:crypto";

import type { ProvisionedEnvironment, ProvisionedState } from "../../shared/protocol.ts";
import { HttpError } from "../http.ts";

import { type ProvisionerClient, UpstreamError } from "./clients.ts";
import type { EnvironmentCredentials, EnvironmentRow, Store } from "./db.ts";
import { type AiSettings, type LicenseSettings, renderEnvironment } from "./render.ts";

const POLL_MS = 2000;
const START_TIMEOUT_MS = 25 * 60 * 1000;

export type EnvironmentsOptions = {
  store: Store;
  provisioner: ProvisionerClient;
  appOrigins: string[];
  onStopped: (environmentId: number) => void;
};

class Superseded extends Error {}

export class Environments {
  private readonly options: EnvironmentsOptions;
  private readonly queues = new Map<number, Promise<void>>();
  private readonly generations = new Map<number, number>();

  constructor(options: EnvironmentsOptions) {
    this.options = options;
  }

  private get store() {
    return this.options.store;
  }

  private enqueue(id: number, task: (generation: number) => Promise<void>) {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous
      .then(() => task(generation))
      .catch((error: unknown) => {
        if (error instanceof Superseded || this.generations.get(id) !== generation) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`environment ${id}: ${message}\n`);
        if (this.store.getEnvironment(id)) {
          this.store.updateEnvironment(id, { status: "error", errorMessage: message, endpoints: null });
        }
      });
    this.queues.set(id, next);
  }

  create(name: string): EnvironmentRow {
    const trimmed = name.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,62}$/.test(trimmed)) {
      throw new HttpError(400, "bad_request", "Use letters, digits, spaces, dots, dashes, or underscores, up to 63 characters");
    }
    if (this.store.getEnvironmentByName(trimmed)) {
      throw new HttpError(400, "bad_request", `An environment named ${trimmed} already exists`);
    }
    this.requireSettings();
    const credentials: EnvironmentCredentials = {
      email: "admin@example.com",
      password: randomBytes(12).toString("base64url"),
      apiKey: `mb_${randomBytes(32).toString("base64")}`,
      agentToken: randomBytes(24).toString("base64url"),
    };
    const environment = this.store.insertEnvironment(trimmed, credentials);
    this.start(environment.id);
    return environment;
  }

  private requireSettings(): { license: LicenseSettings; ai: AiSettings } {
    const license = this.store.getSetting<LicenseSettings>("license");
    const ai = this.store.getSetting<AiSettings>("ai");
    if (!license || !ai) {
      throw new HttpError(400, "bad_request", "Finish setup first: a license and an AI provider are required");
    }
    return { license, ai };
  }

  start(id: number) {
    this.store.updateEnvironment(id, { status: "creating", errorMessage: null });
    this.enqueue(id, async (generation) => {
      const environment = this.mustGet(id);
      const { license, ai } = this.requireSettings();
      const spec = renderEnvironment({
        environment,
        license,
        ai,
        databases: this.store.listDatabases(),
        appOrigins: this.options.appOrigins,
      });
      const { provisioner } = this.options;
      if (environment.provisionerId) {
        await provisioner.replace(environment.provisionerId, spec);
        await provisioner.start(environment.provisionerId);
      } else {
        const created = await provisioner.create(spec);
        this.store.updateEnvironment(id, { provisionerId: created.id });
      }
      const provisioned = await this.waitFor(id, generation, this.mustGet(id).provisionerId as string, ["running"]);
      this.store.updateEnvironment(id, { status: "running", endpoints: provisioned.endpoints, errorMessage: null });
    });
  }

  stop(id: number) {
    const environment = this.mustGet(id);
    if (!environment.provisionerId) {
      this.store.updateEnvironment(id, { status: "stopped", endpoints: null });
      return;
    }
    this.options.onStopped(id);
    this.enqueue(id, async (generation) => {
      await this.options.provisioner.stop(environment.provisionerId as string);
      await this.waitFor(id, generation, environment.provisionerId as string, ["stopped"]);
      this.store.updateEnvironment(id, { status: "stopped", endpoints: null, errorMessage: null });
    });
  }

  delete(id: number) {
    const environment = this.mustGet(id);
    this.options.onStopped(id);
    this.store.updateEnvironment(id, { status: "deleting", endpoints: null });
    this.enqueue(id, async (generation) => {
      if (environment.provisionerId) {
        try {
          await this.options.provisioner.delete(environment.provisionerId);
          await this.waitForGone(id, generation, environment.provisionerId);
        } catch (error) {
          if (!(error instanceof UpstreamError && error.status === 404)) {
            throw error;
          }
        }
      }
      this.store.deleteEnvironment(id);
      this.queues.delete(id);
    });
  }

  async reconcile() {
    for (const environment of this.store.listEnvironments()) {
      if (!environment.provisionerId) {
        if (environment.status === "creating") {
          this.start(environment.id);
        } else if (environment.status === "deleting") {
          this.store.deleteEnvironment(environment.id);
        }
        continue;
      }
      try {
        const provisioned = await this.options.provisioner.get(environment.provisionerId);
        if (environment.status === "deleting") {
          this.delete(environment.id);
        } else if (provisioned.state === "running") {
          this.store.updateEnvironment(environment.id, { status: "running", endpoints: provisioned.endpoints });
        } else if (provisioned.state === "starting" || environment.status === "creating") {
          this.start(environment.id);
        } else if (provisioned.state === "stopped") {
          this.store.updateEnvironment(environment.id, { status: "stopped", endpoints: null });
        }
      } catch (error) {
        if (error instanceof UpstreamError && error.status === 404) {
          if (environment.status === "deleting") {
            this.store.deleteEnvironment(environment.id);
          } else {
            this.store.updateEnvironment(environment.id, { provisionerId: null, status: "stopped", endpoints: null });
          }
        } else {
          process.stderr.write(`reconcile ${environment.id}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    }
  }

  mustGet(id: number): EnvironmentRow {
    const environment = this.store.getEnvironment(id);
    if (!environment) {
      throw new HttpError(404, "not_found", `No environment ${id}`);
    }
    return environment;
  }

  private checkCurrent(id: number, generation: number) {
    if (this.generations.get(id) !== generation) {
      throw new Superseded();
    }
  }

  private async waitFor(
    id: number,
    generation: number,
    provisionerId: string,
    states: ProvisionedState[],
  ): Promise<ProvisionedEnvironment> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    for (;;) {
      this.checkCurrent(id, generation);
      const provisioned = await this.options.provisioner.get(provisionerId);
      if (states.includes(provisioned.state)) {
        return provisioned;
      }
      if (provisioned.state === "error") {
        throw new Error(provisioned.error ?? "The provisioner reported an error");
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${states.join(" or ")}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }

  private async waitForGone(id: number, generation: number, provisionerId: string) {
    const deadline = Date.now() + START_TIMEOUT_MS;
    for (;;) {
      this.checkCurrent(id, generation);
      try {
        const provisioned = await this.options.provisioner.get(provisionerId);
        if (provisioned.state === "error") {
          throw new Error(provisioned.error ?? "The provisioner could not delete the environment");
        }
      } catch (error) {
        if (error instanceof UpstreamError && error.status === 404) {
          return;
        }
        throw error;
      }
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the environment to be deleted");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}
