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
    purchasePrice?: number | null;
    notes?: string | null;
  }>;
  personalIncomes?: Array<{
    id?: number;
    shareholderName?: string | null;
    taxYear: number;
    category: string;
    label: string;
    amount: number;
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
        purchasePrice?: number;
        notes?: string;
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
    }
  | {
      op: 'addPersonalIncome';
      match: { shareholderName?: string | null };
      set: {
        taxYear: number;
        category: string;
        label: string;
        amount: number;
        source?: string;
        slipType?: string;
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
    '- Les "updates" doivent se limiter aux opérations décrites (upsertProperty, addRevenue, addExpense, addPersonalIncome).',
    '- Utilise des dates ISO (YYYY-MM-DD) et des montants numériques CAD.',
    '- Lorsque tu ajustes un immeuble détenu par plusieurs personnes, précise la répartition et toute clause (ex: montant prioritaire au client) dans "notes" et calcule les revenus/dépenses selon la part du client.',
    '- Pour les revenus personnels (salaire, dividendes, gains), utilise "addPersonalIncome" avec l’une des catégories valides: EMPLOYMENT, PENSION, OAS, CPP_QPP, RRIF_RRSP, BUSINESS, ELIGIBLE_DIVIDEND, NON_ELIGIBLE_DIVIDEND, CAPITAL_GAIN, OTHER.',
    '- Si un revenu n’est précisé que pour une portion de l’année, extrapole pour l’année complète et explique le calcul dans "message".',
    '- Pose une seule question à la fois dans "nextQuestion" quand completed=false.',
    '',
    'Schéma JSON attendu:',
  '{\n  "completed": boolean,\n  "message": string,\n  "nextQuestion": null | { "id": string, "label": string, "type": "text" | "number" | "select", "options"?: {"value": string, "label": string}[], "placeholder"?: string },\n  "updates": Array<\n    | { "op": "upsertProperty", "match": { "name": string }, "set": { "address"?: string, "acquisitionDate"?: string, "currentValue"?: number, "purchasePrice"?: number, "notes"?: string } }\n    | { "op": "addRevenue" | "addExpense", "match": { "propertyName": string }, "set": { "label": string, "amount": number, "frequency": "PONCTUEL" | "HEBDOMADAIRE" | "MENSUEL" | "TRIMESTRIEL" | "ANNUEL", "startDate": string, "endDate"?: string | null } }\n    | { "op": "addPersonalIncome", "match": { "shareholderName"?: string | null }, "set": { "taxYear": number, "category": string, "label": string, "amount": number, "source"?: string, "slipType"?: string } }\n  ]\n}',
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
          currentValue: typeof set.currentValue === 'number' ? set.currentValue : undefined,
          purchasePrice: typeof set.purchasePrice === 'number' ? set.purchasePrice : undefined,
          notes: typeof set.notes === 'string' ? set.notes : undefined
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
    } else if (u?.op === 'addPersonalIncome' && u?.set && typeof u.set === 'object') {
      const taxYear = Number(u.set.taxYear);
      if (
        Number.isFinite(taxYear) &&
        typeof u.set.label === 'string' &&
        typeof u.set.category === 'string' &&
        typeof u.set.amount === 'number'
      ) {
        updates.push({
          op: 'addPersonalIncome',
          match: {
            shareholderName:
              u.match && typeof u.match.shareholderName === 'string'
                ? u.match.shareholderName
                : undefined
          },
          set: {
            taxYear,
            category: u.set.category,
            label: u.set.label,
            amount: u.set.amount,
            source: typeof u.set.source === 'string' ? u.set.source : undefined,
            slipType: typeof u.set.slipType === 'string' ? u.set.slipType : undefined
          }
        });
      }
    }
  }

  return { completed, message, nextQuestion, updates };
}

function heuristicNextConversationStep(
  expertId: 'fiscaliste' | 'comptable' | 'planificateur' | 'avocat',
  message: string,
  snapshot: ConvoSnapshot
): ConvoStep {
  // Heuristique minimale et déterministe pour garantir un flux sans dépendance GPT.
  // Stratégie simple:
  // - S'il n'y a aucun immeuble, demander le nom du premier immeuble.
  // - Sinon, proposer de saisir un revenu mensuel de l'immeuble principal.
  // - Sinon, demander un revenu personnel (salaire) de l'année courante.

  const properties = Array.isArray(snapshot.properties) ? snapshot.properties : [];
  const personalIncomes = Array.isArray(snapshot.personalIncomes) ? snapshot.personalIncomes : [];

  if (properties.length === 0) {
    return {
      completed: false,
      message:
        "Pour démarrer, quel est le nom de votre immeuble principal ? Vous pourrez ensuite ajouter sa valeur et ses flux.",
      nextQuestion: {
        id: 'propertyName',
        label: "Nom de l'immeuble",
        type: 'text',
        placeholder: "Ex: Duplex Saint-Laurent"
      },
      updates: []
    };
  }

  const mainPropertyName = properties[0]?.name || 'votre immeuble';

  // Proposer un revenu mensuel si aucun flux n'est connu.
  if (message.toLowerCase().includes('revenu') || message.toLowerCase().includes('loyer')) {
    return {
      completed: false,
      message: `Indiquez le loyer mensuel (CAD) pour ${mainPropertyName}.`,
      nextQuestion: {
        id: 'monthlyRent',
        label: `Loyer mensuel de ${mainPropertyName} (CAD)`,
        type: 'number',
        placeholder: 'Ex: 1450'
      },
      updates: []
    };
  }

  if (personalIncomes.length === 0) {
    return {
      completed: false,
      message:
        "Avez-vous un salaire annuel à déclarer pour l'année en cours ? Vous pouvez le saisir en dollars CAD.",
      nextQuestion: {
        id: 'annualSalary',
        label: "Salaire annuel (CAD)",
        type: 'number',
        placeholder: 'Ex: 82000'
      },
      updates: []
    };
  }

  // Si on a déjà un début de contexte, proposer d'ajouter une dépense ou de passer à l'analyse.
  return {
    completed: false,
    message:
      "Souhaitez-vous ajouter une dépense récurrente (ex: hypothèque, taxes) ou passer à l'analyse préliminaire?",
    nextQuestion: {
      id: 'nextAction',
      label: 'Choisissez une action',
      type: 'select',
      options: [
        { value: 'addExpense', label: 'Ajouter une dépense récurrente' },
        { value: 'analyze', label: 'Passer à une analyse préliminaire' }
      ]
    },
    updates: []
  };
}

export async function nextConversationStep(
  expertId: 'fiscaliste' | 'comptable' | 'planificateur' | 'avocat',
  message: string,
  snapshot: ConvoSnapshot
): Promise<ConvoStep> {
  const mode = (env.ADVISOR_ENGINE || '').toLowerCase();

  // Fallback automatique vers l'heuristique si pas de clé ou mode explicitement heuristique
  const canUseGpt = Boolean(env.OPENAI_API_KEY);
  const useHeuristic = mode === 'heuristic' || !canUseGpt;

  if (useHeuristic) {
    return heuristicNextConversationStep(expertId, message, snapshot);
  }

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
