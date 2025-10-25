/* eslint-disable @typescript-eslint/no-explicit-any */
import { env } from '../../env';

type Frequency = 'PONCTUEL' | 'HEBDOMADAIRE' | 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL';

export type ConvoSnapshot = {
  properties?: Array<{
    id?: number;
    name: string;
    address?: string | null;
    acquisitionDate?: string | null;
    currentValue?: number | null;
  }>;
};

export type ConvoUpdate =
  | {
      op: 'upsertProperty';
      match: { name: string };
      set: {
        address?: string;
        acquisitionDate?: string; // ISO YYYY-MM-DD
        currentValue?: number;
      };
    }
  | {
      op: 'addRevenue' | 'addExpense';
      match: { propertyName: string };
      set: {
        label: string;
        amount: number;
        frequency: Frequency;
        startDate: string; // ISO
        endDate?: string | null;
      };
    };

export type ConvoStep = {
  completed: boolean;
  message: string; // texte à afficher à l’utilisateur
  nextQuestion: null | {
    id: string;
    label: string;
    type: 'text' | 'number' | 'select';
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
  };
  updates: ConvoUpdate[];
};

const TARGETED_MODEL = () => env.OPENAI_MODEL_TARGETED || env.OPENAI_MODEL || 'gpt-4.1-mini';

function isAzureProvider(): boolean {
  if (env.OPENAI_PROVIDER === 'azure') return true;
  const base = env.OPENAI_BASE_URL || '';
  return /\.openai\.azure\.com/i.test(base);
}

function normalizeOpenAIBaseUrl(base: string | undefined): string {
  const trimmed = (base || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (/^https:\/\/api\.openai\.com$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

async function callOpenAIJson(prompt: string, signal?: AbortSignal): Promise<any> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY manquant: configurez une clé API pour activer GPT.');
  }

  const azure = isAzureProvider();
  let url: string;
  let headers: Record<string, string>;
  const body = {
    model: TARGETED_MODEL(),
    messages: [
      { role: 'system', content: 'Tu es un spécialiste qui mène un entretien et renvoie STRICTEMENT du JSON valide.' },
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
    headers = { 'Content-Type': 'application/json', 'api-key': env.OPENAI_API_KEY };
  } else {
    const base = normalizeOpenAIBaseUrl(env.OPENAI_BASE_URL);
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('Réponse OpenAI vide.');
  }
  return JSON.parse(content);
}

function buildPrompt(expertId: 'fiscaliste' | 'comptable' | 'planificateur' | 'avocat', message: string, snapshot: ConvoSnapshot): string {
  const roleLabel =
    expertId === 'fiscaliste'
      ? 'fiscaliste'
      : expertId === 'comptable'
      ? 'comptable'
      : expertId === 'planificateur'
      ? 'planificateur financier'
      : 'avocat corporatif';

  const instructions = [
    `Tu es ${roleLabel}. Tu conduis une conversation structurée pour compléter un dossier immobilier.`,
    'Contraintes strictes:',
    '- Réponds UNIQUEMENT au format JSON valide selon le schéma ci-dessous, rien d’autre.',
    '- Les "updates" doivent se limiter aux opérations décrites (upsertProperty, addRevenue, addExpense).',
    '- Utilise des dates ISO (YYYY-MM-DD) et des montants numériques CAD.',
    '- Pose une seule question à la fois dans "nextQuestion" quand completed=false.',
    '',
    'Schéma JSON attendu:',
    '{\n  "completed": boolean,\n  "message": string,\n  "nextQuestion": null | { "id": string, "label": string, "type": "text" | "number" | "select", "options"?: {"value": string, "label": string}[], "placeholder"?: string },\n  "updates": Array<\n    | { "op": "upsertProperty", "match": { "name": string }, "set": { "address"?: string, "acquisitionDate"?: string, "currentValue"?: number } }\n    | { "op": "addRevenue" | "addExpense", "match": { "propertyName": string }, "set": { "label": string, "amount": number, "frequency": "PONCTUEL" | "HEBDOMADAIRE" | "MENSUEL" | "TRIMESTRIEL" | "ANNUEL", "startDate": string, "endDate"?: string | null } }\n  ]\n}',
    '',
    'Contexte minimal (état actuel):',
    JSON.stringify(snapshot, null, 2),
    '',
    'Message utilisateur:',
    message
  ];

  return instructions.join('\n');
}

function coerceStep(data: any): ConvoStep {
  const completed = typeof data?.completed === 'boolean' ? data.completed : false;
  const message = typeof data?.message === 'string' ? data.message : '';
  const next = data?.nextQuestion ?? null;
  const nextQuestion =
    next && typeof next === 'object' && typeof next.id === 'string' && typeof next.label === 'string'
      ? {
          id: next.id,
          label: next.label,
          type: next.type === 'number' || next.type === 'select' ? next.type : 'text',
          options: Array.isArray(next.options)
            ? next.options
                .filter((opt: any) => opt && typeof opt.value === 'string' && typeof opt.label === 'string')
                .map((opt: any) => ({ value: opt.value, label: opt.label }))
            : undefined,
          placeholder: typeof next.placeholder === 'string' ? next.placeholder : undefined
        }
      : null;

  const rawUpdates: any[] = Array.isArray(data?.updates) ? data.updates : [];
  const updates: ConvoUpdate[] = [];
  for (const u of rawUpdates) {
    if (u && u.op === 'upsertProperty' && u.match && typeof u.match.name === 'string') {
      const set = u.set || {};
      const update: ConvoUpdate = {
        op: 'upsertProperty',
        match: { name: u.match.name },
        set: {
          address: typeof set.address === 'string' ? set.address : undefined,
          acquisitionDate: typeof set.acquisitionDate === 'string' ? set.acquisitionDate : undefined,
          currentValue: typeof set.currentValue === 'number' ? set.currentValue : undefined
        }
      };
      updates.push(update);
    } else if (
      (u?.op === 'addRevenue' || u?.op === 'addExpense') &&
      u?.match &&
      typeof u.match.propertyName === 'string' &&
      u?.set &&
      typeof u.set.label === 'string' &&
      typeof u.set.amount === 'number' &&
      typeof u.set.frequency === 'string' &&
      typeof u.set.startDate === 'string'
    ) {
      updates.push({
        op: u.op,
        match: { propertyName: u.match.propertyName },
        set: {
          label: u.set.label,
          amount: u.set.amount,
          frequency: u.set.frequency,
          startDate: u.set.startDate,
          endDate: typeof u.set.endDate === 'string' ? u.set.endDate : undefined
        }
      });
    }
  }

  return { completed, message, nextQuestion, updates };
}

export async function nextConversationStep(
  expertId: 'fiscaliste' | 'comptable' | 'planificateur' | 'avocat',
  message: string,
  snapshot: ConvoSnapshot
): Promise<ConvoStep> {
  const prompt = buildPrompt(expertId, message, snapshot);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const data = await callOpenAIJson(prompt, controller.signal);
    return coerceStep(data);
  } finally {
    clearTimeout(timeout);
  }
}
