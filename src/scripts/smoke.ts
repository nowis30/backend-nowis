const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:4000';
const TOKEN = process.env.SMOKE_TOKEN; // facultatif, requis pour endpoints protégés

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
  for (const { path, needsAuth, expect } of checks) {
    const url = BASE_URL + path;
    try {
      const headers: Record<string, string> = {};
      if (needsAuth) {
        if (!TOKEN) {
          console.warn(`⚠️  ${path} ignoré (SMOKE_TOKEN manquant)`);
          continue;
        }
        headers.Authorization = `Bearer ${TOKEN}`;
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
