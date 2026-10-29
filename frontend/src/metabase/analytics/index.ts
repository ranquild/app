interface SimpleEvent {
  event: string;
  triggered_from?: string | null;
}

/** App sends no product analytics; events are accepted and dropped. */
export function trackSimpleEvent(_event: SimpleEvent): void {}
