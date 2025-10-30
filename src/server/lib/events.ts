import { env } from '../env';
// Typage souple pour éviter une dépendance dure aux types ioredis pendant les tests locaux sans node_modules
type RedisLike = any;
let redisPub: RedisLike | null = null;
let redisSub: RedisLike | null = null;
let subLoopRunning = false;

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
  // Optionnel: envoyer dans Redis Stream
  if (redisPub) {
    try {
      // Store as JSON to a single field for simplicity
      redisPub.xadd('events', '*', 'json', JSON.stringify(e)).catch(() => {});
    } catch {}
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

// --- Persistence (Redis Streams) ---
export async function initEventBus(): Promise<void> {
  if (!env.REDIS_URL) return;
  try {
    // @ts-ignore optional dependency: types may be missing in some local runs
    const { default: IORedis } = await import('ioredis');
    redisPub = new IORedis(env.REDIS_URL, { lazyConnect: true });
    redisSub = new IORedis(env.REDIS_URL, { lazyConnect: true });
    await Promise.allSettled([redisPub.connect(), redisSub.connect()]);
    // Create group if not exists
    await redisPub!.xgroup('CREATE', 'events', 'nowis', '$', 'MKSTREAM').catch(() => {});
    // Start consumer loop
    if (!subLoopRunning) {
      subLoopRunning = true;
      void consumerLoop();
    }
  } catch {
    redisPub = null;
    redisSub = null;
  }
}

export async function shutdownEventBus(): Promise<void> {
  subLoopRunning = false;
  try { await redisPub?.quit(); } catch {}
  try { await redisSub?.quit(); } catch {}
  redisPub = null;
  redisSub = null;
}

async function consumerLoop(): Promise<void> {
  if (!redisSub) return;
  const consumerName = `web-${Math.random().toString(36).slice(2, 8)}`;
  while (subLoopRunning && redisSub) {
    try {
      // Read next entries for group
      const res = await redisSub.xreadgroup('GROUP', 'nowis', consumerName, 'COUNT', 50, 'BLOCK', 1000, 'STREAMS', 'events', '>' );
      if (Array.isArray(res)) {
        for (const [, entries] of res as any[]) {
          for (const [id, fields] of entries) {
            try {
              const idx = fields.findIndex((f: any) => f === 'json');
              if (idx >= 0) {
                const payload = JSON.parse(fields[idx + 1]);
                // Ré-injecte localement pour l’API /events/recent
                publish(payload as AppEvent);
              }
            } catch {}
            // Ack
            try { await redisSub.xack('events', 'nowis', id); } catch {}
          }
        }
      }
    } catch {
      // backoff léger
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
