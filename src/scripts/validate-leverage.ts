import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '');
let AUTH_TOKEN = process.env.AUTH_TOKEN;
const LOGIN_EMAIL = process.env.LOGIN_EMAIL;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const ALLOW_REGISTER = /^(1|true|yes)$/i.test(String(process.env.ALLOW_REGISTER ?? ''));

function abortableFetch(input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 60000, ...rest } = init || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...rest, signal: controller.signal }).finally(() => clearTimeout(id));
}

function ensureBaseUrlEnv() {
  const missing: string[] = [];
  if (!BASE_URL) missing.push('BASE_URL');
  if (missing.length) {
    console.error(`Variables d'environnement manquantes: ${missing.join(', ')}`);
    console.error('Exemple:');
    console.error('  BASE_URL=https://your-api.example.com AUTH_TOKEN=eyJhbGciOi... npm run validate:leverage');
    console.error('  # ou sans AUTH_TOKEN, fournir LOGIN_EMAIL/LOGIN_PASSWORD (et ALLOW_REGISTER=1 si besoin)');
    console.error('  BASE_URL=... LOGIN_EMAIL=user@example.com LOGIN_PASSWORD="YourPassw0rd!" npm run validate:leverage');
    process.exit(1);
  }
}

async function fetchJson(method: string, url: string, body?: unknown) {
  const res = await abortableFetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs: 60000
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function ensureAuthToken() {
  if (AUTH_TOKEN) return;
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    console.error('AUTH_TOKEN manquant et aucun LOGIN_EMAIL/LOGIN_PASSWORD fourni.');
    process.exit(1);
  }

  // Essayer login
  const login = await fetchJson('POST', `${BASE_URL}/api/auth/login`, {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD
  });
  if (login.ok && (login.json as any)?.token) {
    AUTH_TOKEN = (login.json as any).token as string;
    return;
  }

  if (!ALLOW_REGISTER) {
    console.error(`Echec de /auth/login (${login.status}). Fournissez AUTH_TOKEN ou ALLOW_REGISTER=1 pour créer un compte test.`);
    process.exit(1);
  }

  // Essayer register si autorisé
  const register = await fetchJson('POST', `${BASE_URL}/api/auth/register`, {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD
  });
  if (register.ok && (register.json as any)?.token) {
    AUTH_TOKEN = (register.json as any).token as string;
    return;
  }

  console.error(`Echec de /auth/register (${register.status}). Réessayez avec des identifiants différents ou un AUTH_TOKEN existant.`);
  process.exit(1);
}

async function postSimulate(body: Record<string, unknown>, save: boolean) {
  const res = await abortableFetch(`${BASE_URL}/api/leverage/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({ ...(body || {}), save }),
    timeoutMs: 60000
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST /simulate ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as { summary: unknown; savedScenarioId?: number };
}

async function getScenarios() {
  const res = await abortableFetch(`${BASE_URL}/api/leverage`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`
    },
    timeoutMs: 60000
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GET /api/leverage ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as Array<any>;
}

async function checkConnectivity() {
  // Try /api/health first, then fallback to /health
  const candidates = [`${BASE_URL}/api/health`, `${BASE_URL}/health`];
  for (const url of candidates) {
    try {
      const res = await abortableFetch(url, { timeoutMs: 15000 });
      if (res.ok) {
        return true;
      }
    } catch (_err) {
      // Try next
    }
  }
  return false;
}

async function main() {
  ensureBaseUrlEnv();
  await ensureAuthToken();
  const healthy = await checkConnectivity();
  if (!healthy) {
    console.error('Impossible de joindre /api/health ni /health sur BASE_URL. Vérifiez le déploiement et le pare-feu.');
    process.exit(1);
  }

  const payload = {
    label: `Validation ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    sourceType: 'HOME_EQUITY',
    principal: 100000,
    annualRate: 0.06,
    termMonths: 60,
    amortizationMonths: 300,
    startDate: new Date().toISOString(),
    investmentVehicle: 'ETF',
    expectedReturnAnnual: 0.07,
    expectedVolatility: 0.15,
    planHorizonYears: 10,
    interestDeductible: true,
    marginalTaxRate: 0.45
  } as const;

  console.log('1) Simulation sans sauvegarde...');
  let simOnly;
  try {
    simOnly = await postSimulate(payload, false);
  } catch (err) {
    console.warn('Simulation sans sauvegarde a échoué, tentative de retry unique...', (err as Error)?.message);
    simOnly = await postSimulate(payload, false);
  }
  console.log('   -> OK, summary reçu.');

  console.log('2) Simulation avec sauvegarde...');
  const simSaved = await postSimulate(payload, true);
  console.log(`   -> OK, scenario ID: ${simSaved.savedScenarioId ?? 'inconnu'}`);

  console.log('3) Liste des scénarios...');
  const scenarios = await getScenarios();
  const found = scenarios.find((s) => s?.id === simSaved.savedScenarioId);
  console.log(`   -> ${found ? 'Présent' : 'Absent'} dans la liste (${scenarios.length} items).`);

  const outDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(
    outDir,
    `leverage-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        payload,
        simOnly,
        simSaved,
        foundInList: Boolean(found)
      },
      null,
      2
    )
  );
  console.log(`4) Rapport écrit: ${outPath}`);
}

main().catch((err) => {
  console.error('Validation leverage échouée:', err?.message || err);
  process.exit(1);
});
