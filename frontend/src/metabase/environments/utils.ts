import type { EnvironmentStatus } from "metabase-types/api";

export function getPort(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    return null;
  }
}

const TRANSITIONAL_STATUSES: EnvironmentStatus[] = ["creating", "deleting"];

export function isTransitioning(status: EnvironmentStatus) {
  return TRANSITIONAL_STATUSES.includes(status);
}

export const POLLING_INTERVAL_MS = 2000;
