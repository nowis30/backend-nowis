export {};

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASSWORD;

function abortableFetch(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 15000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

async function fetchJson(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await abortableFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  if (!BASE_URL || !EMAIL || !PASSWORD) {
    console.error('Missing env BASE_URL/LOGIN_EMAIL/LOGIN_PASSWORD');
    process.exit(1);
  }

  // Login
  const login = await fetchJson('POST', `${BASE_URL}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (!login.ok || !(login.json as any)?.token) {
    console.error('Login failed', login.status, login.json);
    process.exit(1);
  }
  const token = (login.json as any).token as string;
  const auth = { Authorization: `Bearer ${token}` };

  // List rules for visibility
  const rules = await fetchJson('GET', `${BASE_URL}/api/monitoring/rules`, undefined, auth);
  console.log('Rules status:', rules.status);
  console.log('Rules:', JSON.stringify(rules.json, null, 2));

  // Trigger an error on leverage simulate
  const bad = await fetchJson('POST', `${BASE_URL}/api/leverage/simulate`, { label: 'Bad', sourceType: 'HOME_EQUITY', principal: -1 }, auth);
  console.log('Leverage simulate (expected error):', bad.status);

  // Poll for events (retry up to ~10s)
  let found = false;
  let lastItems: any[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const events = await fetchJson('GET', `${BASE_URL}/api/monitoring/events`, undefined, auth);
    console.log(`Events status [try ${attempt}]:`, events.status);
    const items = ((events.json as any[]) || []) as any[];
    lastItems = items;
    const recent = items.slice(0, 5);
    const hasLeverage = recent.some((e: any) => {
      const p = e?.payload;
      const path = typeof p?.path === 'string' ? p.path : '';
      return path.includes('/api/leverage/simulate') && (e?.status === 'TRIGGERED');
    });
    if (hasLeverage) {
      found = true;
      console.log('✓ Found leverage error event in recent events');
      console.log('Recent events:', JSON.stringify(recent, null, 2));
      break;
    }
  }
  if (!found) {
    console.log('Recent events (no leverage event found):', JSON.stringify(lastItems.slice(0, 5), null, 2));
  }

  // Also list notifications for visibility (should include LOG notifications)
  const notifications = await fetchJson('GET', `${BASE_URL}/api/monitoring/notifications`, undefined, auth);
  console.log('Notifications status:', notifications.status);
  const notifItems = ((notifications.json as any[]) || []) as any[];
  console.log('Notifications count:', notifItems.length);
  console.log('Recent notifications:', JSON.stringify(notifItems.slice(0, 5), null, 2));
}

main().catch((err) => {
  console.error('Test telemetry failed:', err?.message || err);
  process.exit(1);
});