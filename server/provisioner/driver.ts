import type { EnvironmentSpec, Endpoints, ServiceName, ServiceState } from "../../shared/protocol.ts";

export type Placement = Record<string, unknown>;

export type DriverEnvironment = {
  id: string;
  spec: EnvironmentSpec;
  placement: Placement;
};

export type Inspection = {
  services: Record<ServiceName, ServiceState>;
  endpoints: Endpoints | null;
};

export interface Driver {
  readonly name: string;
  place(id: string, others: DriverEnvironment[]): Promise<Placement>;
  up(environment: DriverEnvironment, isCurrent: () => boolean): Promise<Placement>;
  stop(environment: DriverEnvironment): Promise<Placement>;
  destroy(environment: DriverEnvironment): Promise<void>;
  inspect(environment: DriverEnvironment): Promise<Inspection>;
  logs(environment: DriverEnvironment, service: ServiceName | null, tail: number): Promise<string>;
}

export class Superseded extends Error {}

export async function poll<T>(
  isCurrent: () => boolean,
  timeoutMs: number,
  intervalMs: number,
  check: (elapsedMs: number) => Promise<T | null>,
  onTimeout: () => Promise<Error>,
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    if (!isCurrent()) {
      throw new Superseded();
    }
    const result = await check(Date.now() - startedAt);
    if (result !== null) {
      return result;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw await onTimeout();
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
