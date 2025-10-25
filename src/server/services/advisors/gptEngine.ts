import { env } from '../../env';
import { describeUncertainFacts, determineNextQuestion, parseFacts } from './parser';
import type {
  AdvisorAnswer,
  AdvisorContext,
  AdvisorExpertId,
  AdvisorMetric,
  AdvisorModuleOutput,
  AdvisorRecommendation,
  AdvisorResult,
  AdvisorUncertaintyField
} from './types';

type AdvisorResultCore = Omit<AdvisorResult, 'engine'>;

const DEFAULT_MODEL = () => env.OPENAI_MODEL || 'gpt-4.1';
const DEFAULT_BASE_URL = () => env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function isAzureProvider(): boolean {
  if (env.OPENAI_PROVIDER === 'azure') return true;
  const base = env.OPENAI_BASE_URL || '';
  return /\.openai\.azure\.com/i.test(base);
}

function normalizeOpenAIBaseUrl(base: string): string {
  // Si l'utilisateur a fourni https://api.openai.com sans /v1, ajouter /v1 automatiquement
  const trimmed = base.replace(/\/$/, '');
  if (/^https:\/\/api\.openai\.com$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return base;
}

function buildPrompt(context: AdvisorContext): string {
  const facts = context.parsed;
  const uncertainFields = Object.entries(facts.uncertain)
    .filter(([, flagged]) => Boolean(flagged))
    .map(([field]) => field)
    .sort();

  const payload = {
    assetProfile: facts.assetProfile,
    taxableIncome: facts.taxableIncome,
    profitMarginRatio: facts.profitMargin,
    profitMarginPercent: facts.profitMargin != null ? facts.profitMargin * 100 : null,
    province: facts.province,
    hasHoldingCompany: facts.hasHoldingCompany,
    dividendIntent: facts.dividendIntent,
    liquidityGoal: facts.liquidityGoal,
    legalConcern: facts.legalConcern,
    uncertainFields
  };

  return [
    'Tu es un comité d’experts (fiscaliste, comptable, planificateur financier, avocat corporatif).',
    'À partir des faits fournis, produis un diagnostic final et des recommandations concrètes.',
    'Contraintes:',
    '- Réponds STRICTEMENT en JSON valide selon le schéma demandé.',
    '- Utilise des identifiants d’experts exactement: ["fiscaliste","comptable","planificateur","avocat"].',
    '- Mets au moins 4 métriques totales (fusionnées si nécessaire) et 1 suivi.',
    '- Ne comble jamais les données manquantes : si un champ est null ou listé dans "uncertainFields", mentionne l’incertitude dans ton analyse et propose des validations concrètes.',
    '- Ajuste les recommandations selon le profil d’actifs et souligne les hypothèses lorsque l’information est approximative.',
    '',
    'Schéma JSON attendu (ne fournis rien d’autre):',
    '{\n  "nextQuestion": null,\n  "completed": true,\n  "coordinatorSummary": string,\n  "recommendations": [\n    { "expertId": string, "title": string, "summary": string, "rationale": string[] }\n  ],\n  "metrics": [\n    { "id": string, "label": string, "value": string, "explanation": string, "expertIds": string[] }\n  ],\n  "followUps": string[]\n}',
    '',
    'Faits structurés:',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

async function callOpenAIJson(prompt: string, signal?: AbortSignal): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY manquant: configurez une clé API pour activer GPT.');
  }

  const azure = isAzureProvider();
  let url: string;
  let headers: Record<string, string>;
  const body = {
    model: DEFAULT_MODEL(),
    messages: [
      { role: 'system', content: 'Tu es un assistant d’entreprise strictement factuel et structuré.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2 as number,
    response_format: { type: 'json_object' as const }
  };

  if (azure) {
    const base = env.OPENAI_BASE_URL || '';
    const deployment = env.OPENAI_AZURE_DEPLOYMENT;
    const apiVersion = env.OPENAI_API_VERSION || '2024-02-15-preview';
    if (!deployment) {
      throw new Error('OPENAI_AZURE_DEPLOYMENT manquant pour Azure OpenAI.');
    }
    url = `${base.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    headers = {
      'Content-Type': 'application/json',
      'api-key': env.OPENAI_API_KEY
    };
    // Azure ignore souvent "model" dans le body; conservé pour compatibilité
  } else {
    const base = normalizeOpenAIBaseUrl(DEFAULT_BASE_URL());
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('Réponse OpenAI vide.');
  }
  return JSON.parse(content);
}

function coerceCoreShape(data: any): AdvisorResultCore {
  const safeStr = (v: any, def = '') => (typeof v === 'string' ? v : def);
  const safeBool = (v: any, def = false) => (typeof v === 'boolean' ? v : def);
  const safeArray = (v: any) => (Array.isArray(v) ? v : []);
  const toExpertId = (v: any): AdvisorExpertId | null => {
    const s = safeStr(v);
    return s === 'fiscaliste' || s === 'comptable' || s === 'planificateur' || s === 'avocat' ? (s as AdvisorExpertId) : null;
  };
  const recs = safeArray(data.recommendations)
    .map((r: any): AdvisorRecommendation | null => {
      const expertId = toExpertId(r?.expertId);
      if (!expertId) return null;
      return {
        expertId,
        title: safeStr(r?.title),
        summary: safeStr(r?.summary),
        rationale: safeArray(r?.rationale).map((x) => safeStr(x)).filter(Boolean)
      };
    })
    .filter((x): x is AdvisorRecommendation => x !== null);
  const metrics = safeArray(data.metrics).map((m: any): AdvisorMetric => ({
    id: safeStr(m?.id),
    label: safeStr(m?.label),
    value: safeStr(m?.value),
    explanation: safeStr(m?.explanation),
    expertIds: safeArray(m?.expertIds)
      .map((x) => toExpertId(x))
      .filter((x): x is AdvisorExpertId => Boolean(x))
  }));

  const uncertainty: AdvisorUncertaintyField[] = safeArray(data.uncertainty)
    .map((item: any): AdvisorUncertaintyField | null => {
      const questionId = safeStr(item?.questionId);
      const label = safeStr(item?.label);
      if (!questionId || !label) {
        return null;
      }
      const description = safeStr(item?.description) || undefined;
      return { questionId, label, description };
    })
    .filter((entry): entry is AdvisorUncertaintyField => Boolean(entry));

  return {
    nextQuestion: null,
    completed: safeBool(data.completed, true),
    coordinatorSummary: safeStr(data.coordinatorSummary),
  recommendations: recs,
    metrics,
    followUps: safeArray(data.followUps).map((x) => safeStr(x)).filter(Boolean),
    uncertainty
  };
}

export async function buildGptCore(answers: AdvisorAnswer[]): Promise<AdvisorResultCore> {
  const nextQuestion = determineNextQuestion(answers);
  const parsed = parseFacts(answers);
  const uncertainty = describeUncertainFacts(answers, parsed.uncertain);
  if (nextQuestion) {
    // Pas besoin d’appeler GPT tant que le questionnaire n’est pas complété.
    return {
      nextQuestion,
      completed: false,
      coordinatorSummary: '',
      recommendations: [],
      metrics: [],
      followUps: [],
      uncertainty
    };
  }

  const context: AdvisorContext = {
    answers,
    parsed
  };

  const prompt = buildPrompt(context);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const data = await callOpenAIJson(prompt, controller.signal);
    const core = coerceCoreShape(data);
    return {
      ...core,
      nextQuestion: null,
      completed: true,
      uncertainty: core.uncertainty.length ? core.uncertainty : uncertainty
    };
  } catch (err) {
    // En cas d’erreur OpenAI, renvoyer un noyau minimal pour ne pas casser le flux
    return {
      nextQuestion: null,
      completed: true,
      coordinatorSummary:
        "GPT indisponible temporairement. Un diagnostic minimal a été généré. Réessayez plus tard pour une analyse enrichie.",
      recommendations: [
        {
          expertId: 'comptable',
          title: 'Diagnostic minimal',
          summary:
            "Impossible d’appeler GPT pour une synthèse avancée. Utilisez les indicateurs heuristiques ou réessayez ultérieurement.",
          rationale: []
        }
      ],
      metrics: [],
      followUps: [],
      uncertainty
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function pingOpenAI(): Promise<{ ok: boolean; provider: 'openai' | 'azure' | 'unknown'; message?: string }>
{
  try {
    const azure = isAzureProvider();
    const provider: 'openai' | 'azure' | 'unknown' = azure ? 'azure' : env.OPENAI_API_KEY ? 'openai' : 'unknown';
    if (!env.OPENAI_API_KEY) {
      return { ok: false, provider, message: 'OPENAI_API_KEY absent' };
    }
    // Envoie une requête minimale qui renvoie un JSON vide
    const prompt = 'Réponds strictement avec ce JSON: {}';
    await callOpenAIJson(prompt);
    return { ok: true, provider };
  } catch (err) {
    return { ok: false, provider: isAzureProvider() ? 'azure' : 'openai', message: err instanceof Error ? err.message : String(err) };
  }
}
