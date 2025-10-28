export {};

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');
let EMAIL = process.env.LOGIN_EMAIL;
let PASSWORD = process.env.LOGIN_PASSWORD;

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

async function ensureCredentials() {
  if (!EMAIL || !PASSWORD) {
    // Génère un compte éphémère compatible avec les règles de validation
    const ts = Date.now();
    EMAIL = `telemetry-${ts}@nowis.local`;
    // Mot de passe: ≥12 chars, avec maj/min/chiffre/spécial
    PASSWORD = `Nowis!Test${ts}`;
    console.log('Generated ephemeral credentials:', { EMAIL });
  }
}

async function ensureToken(): Promise<string> {
  // Tentative de login
  let login = await fetchJson('POST', `${BASE_URL}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (login.ok && (login.json as any)?.token) return (login.json as any).token as string;

  // Si login échoue → essayer register puis re-login
  const register = await fetchJson('POST', `${BASE_URL}/api/auth/register`, { email: EMAIL, password: PASSWORD });
  if (!(register.ok && (register.json as any)?.token)) {
    // Si register dit "déjà inscrit" on retente le login, sinon on échoue
    const msg = JSON.stringify(register.json);
    if (!/déjà inscrit|already/i.test(msg)) {
      throw new Error(`Register failed: ${register.status} ${msg}`);
    }
  }
  login = await fetchJson('POST', `${BASE_URL}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (!login.ok || !(login.json as any)?.token) {
    throw new Error(`Login failed after register: ${login.status} ${JSON.stringify(login.json)}`);
  }
  return (login.json as any).token as string;
}

async function upsertDefaultRules(auth: Record<string, string>) {
  // Vérifie si des règles existent déjà; sinon crée les 3 règles par défaut
  const rules = await fetchJson('GET', `${BASE_URL}/api/monitoring/rules`, undefined, auth);
  const list = (Array.isArray(rules.json) ? rules.json : []) as any[];
  const hasHealth = list.some((r) => r?.triggerType === 'HEALTH_CHECK');
  const hasLevErr = list.some((r) => r?.triggerType === 'LEVERAGE_ERROR');
  const hasSlow = list.some((r) => r?.triggerType === 'SLOW_REQUEST');

  async function createRule(data: any) {
    await fetchJson('POST', `${BASE_URL}/api/monitoring/rules`, data, auth);
  }

  if (!hasHealth) {
    await createRule({
      name: 'Health check failures',
      triggerType: 'HEALTH_CHECK',
      severity: 'WARNING',
      condition: { url: '/health', expectStatus: 200 }
    });
  }
  if (!hasLevErr) {
    await createRule({
      name: 'Leverage simulation errors',
      triggerType: 'LEVERAGE_ERROR',
      severity: 'WARNING',
      condition: {}
    });
  }
  if (!hasSlow) {
    await createRule({
      name: 'Slow requests',
      triggerType: 'SLOW_REQUEST',
      severity: 'INFO',
      condition: { thresholdMs: 500 }
    });
  }
}

async function main() {
  if (!BASE_URL) {
    console.error('Missing env BASE_URL');
    process.exit(1);
  }

  await ensureCredentials();
  const token = await ensureToken();
  const auth = { Authorization: `Bearer ${token}` };

  // List rules for visibility
  await upsertDefaultRules(auth);
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