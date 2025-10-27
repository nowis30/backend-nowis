export {};

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASSWORD;

function abortableFetch(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 30000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

async function fetchJson(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await abortableFetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 30000
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  if (!BASE_URL || !EMAIL || !PASSWORD) {
    console.error('Missing env: BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD');
    process.exit(1);
  }

  const health = await abortableFetch(`${BASE_URL}/health`, { timeoutMs: 10000 }).catch(() => undefined);
  if (!health || !health.ok) {
    console.warn('Warning: /health not OK; continuing anyway...');
  }

  // Login
  const login = await fetchJson('POST', `${BASE_URL}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (!login.ok || !(login.json as any)?.token) {
    console.error('Login failed', login.status, login.json);
    process.exit(1);
  }
  const token = (login.json as any).token as string;
  const authHeaders = { Authorization: `Bearer ${token}` };

  const rules = [
    {
      name: 'Health check failures',
      description: "Surveille /health et alerte en cas d'échecs consécutifs.",
      isActive: true,
      severity: 'WARNING',
      triggerType: 'HEALTH_CHECK',
      condition: { path: '/health', expectedStatus: 200, timeoutMs: 5000, retries: 2 }
    },
    {
      name: 'Leverage simulation errors',
      description: 'Détecte les erreurs 5xx/4xx répétées sur /api/leverage/simulate.',
      isActive: true,
      severity: 'CRITICAL',
      triggerType: 'LEVERAGE_ERROR',
      condition: { route: '/api/leverage/simulate', threshold: 3, windowMinutes: 10 }
    },
    {
      name: 'Slow requests',
      description: 'Alerte si les requêtes dépassent 2s (moyenne mobile).',
      isActive: true,
      severity: 'WARNING',
      triggerType: 'SLOW_REQUEST',
      condition: { thresholdMs: 2000, sampleSize: 100 }
    }
  ] as const;

  for (const r of rules) {
    const res = await fetchJson('POST', `${BASE_URL}/api/monitoring/rules`, r, authHeaders);
    if (!res.ok) {
      console.error('Rule seed error', r.name, res.status, res.json);
      // continue with others
    } else {
      console.log('Seeded rule:', (res.json as any).id, '-', (res.json as any).name);
    }
  }

  // List back
  const list = await fetchJson('GET', `${BASE_URL}/api/monitoring/rules`, undefined, authHeaders);
  if (list.ok) {
    console.log('Rules total:', (list.json as any)?.length ?? 'n/a');
  }
}

main().catch((err) => {
  console.error('Seed via API failed:', err?.message || err);
  process.exit(1);
});