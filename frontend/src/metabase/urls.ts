import type { DatabaseId, EnvironmentId } from "metabase-types/api";

export const root = () => "/";

export const setup = () => "/setup";

export const environments = () => "/environments";
export const environment = (id: EnvironmentId) => `/environments/${id}`;

export const admin = () => "/admin";
export const adminAiProvider = () => "/admin/settings/ai-provider";
export const adminLicense = () => "/admin/settings/license";
export const adminDatabases = () => "/admin/databases";
export const adminNewDatabase = () => "/admin/databases/create";
export const adminDatabase = (id: DatabaseId) => `/admin/databases/${id}`;

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function getUrlTarget(url: string | undefined): "_self" | "_blank" {
  return url == null || isSameOrigin(url) ? "_self" : "_blank";
}
