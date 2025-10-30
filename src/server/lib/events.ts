type EventPayload = Record<string, unknown> | undefined;

export type AppEvent = {
  type: string;
  at: string; // ISO
  userId?: number;
  payload?: EventPayload;
};

const MAX_EVENTS = 200;
const recent: AppEvent[] = [];
const subs = new Set<(e: AppEvent) => void>();

export function publish(event: AppEvent): void {
  const e: AppEvent = { ...event, at: event.at || new Date().toISOString() };
  recent.push(e);
  while (recent.length > MAX_EVENTS) recent.shift();
  for (const cb of subs) {
    try { cb(e); } catch { /* ignore */ }
  }
}

export function subscribe(cb: (e: AppEvent) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function getRecentEvents(limit = 50): AppEvent[] {
  const n = Math.max(1, Math.min(limit, MAX_EVENTS));
  return recent.slice(-n).reverse();
}
