const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4000';
const TOKEN_ENV = process.env.SMOKE_TOKEN; // facultatif; sinon SMOKE_EMAIL/SMOKE_PASSWORD seront utilisés
const SMOKE_EMAIL = process.env.SMOKE_EMAIL; // ex: render-smoke@nowis.local
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD; // respecter la politique: 12+ chars, Maj, Min, Chiffre, Spécial

type Check = {
  path: string;
  needsAuth?: boolean;
  expect: (res: any) => boolean;
};

const checks: Check[] = [
  { path: '/health', expect: (res) => res.status === 200 && res.data?.status === 'ok' },
  { path: '/api/health', expect: (res) => res.status === 200 && res.data?.status === 'ok' },
  { path: '/api/advisors/health', expect: (res) => res.status === 200 },
  { path: '/api/summary', needsAuth: true, expect: (res) => res.status === 200 },
  { path: '/api/profile/summary', needsAuth: true, expect: (res) => res.status === 200 }
];

(async () => {
  let allOk = true;
  let token = TOKEN_ENV;

  // Obtenir un token automatiquement si email/mdp fournis et pas de SMOKE_TOKEN
  if (!token && SMOKE_EMAIL && SMOKE_PASSWORD) {
    try {
      // Tenter l'inscription (ignorer si déjà inscrit)
      await fetch(BASE_URL + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD })
      });
    } catch {
      // ignorer erreurs réseau ici; on tentera login
    }
    try {
      const res = await fetch(BASE_URL + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD })
      });
      const text = await res.text();
      const data = safeParseJson(text);
      if (res.ok && data?.token) {
        token = data.token;
        console.log('🔐 Token obtenu via /api/auth/login');
      } else {
        console.warn('⚠️  Impossible d\'obtenir un token via /api/auth/login:', text.slice(0, 300));
      }
    } catch (e: any) {
      console.warn('⚠️  Échec de la récupération de token via login:', e.message);
    }
  }
  for (const { path, needsAuth, expect } of checks) {
    const url = BASE_URL + path;
    try {
      const headers: Record<string, string> = {};
      if (needsAuth) {
        if (!token) {
          console.warn(`⚠️  ${path} ignoré (SMOKE_TOKEN manquant)`);
          continue;
        }
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, { headers });
      const bodyText = await res.text();
      const wrapped = { status: res.status, data: safeParseJson(bodyText) } as any;
      if (!expect(wrapped)) {
        console.error(`❌ ${path} : réponse inattendue`, bodyText.slice(0, 300));
        allOk = false;
      } else {
        console.log(`✅ ${path}`);
      }
    } catch (e: any) {
      console.error(`❌ ${path} : erreur`, e.message);
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
})();

function safeParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
