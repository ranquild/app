export const TAG_TYPES = [
  "ai-provider",
  "conversation",
  "database",
  "environment",
  "license",
  "session-properties",
  "setting",
  "setup",
] as const;

export type TagType = (typeof TAG_TYPES)[number];

export function idTag<T extends TagType>(type: T, id: number | string) {
  return { type, id };
}

export function listTag<T extends TagType>(type: T) {
  return { type, id: "LIST" as const };
}
