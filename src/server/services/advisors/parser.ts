import { AdvisorAnswer, AdvisorFacts, AdvisorQuestion, AdvisorUncertaintyField } from './types';

const UNKNOWN_ALIASES = new Set([
  'je ne sais pas',
  "je ne sais pas.",
  'aucune idée',
  'aucune idee',
  'aucun idee',
  'inconnu',
  'inconnue',
  'unknown',
  'n/a',
  'na',
  'pas certain',
  'pas sure',
  'pas sûr',
  'approx',
  'approximatif',
  '?'
]);

function isUnknownValue(raw: string | undefined): boolean {
  if (!raw) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length === 0 || UNKNOWN_ALIASES.has(normalized);
}

function parseNumeric(raw: string | undefined): { value: number | null; uncertain: boolean } {
  if (!raw) {
    return { value: null, uncertain: true };
  }
  const trimmed = raw.trim();
  if (isUnknownValue(trimmed)) {
    return { value: null, uncertain: true };
  }
  const cleaned = trimmed.replace(/[^0-9.,-]/g, '').replace(',', '.');
  if (!cleaned || cleaned === '.' || cleaned === '-' || cleaned === '-.' || cleaned === '.-') {
    return { value: null, uncertain: true };
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return { value: null, uncertain: true };
  }
  return { value: parsed, uncertain: cleaned !== trimmed };
}

function normalizeSelectValue<T extends string>(
  raw: string | undefined,
  allowed: readonly T[]
): { value: T | 'UNKNOWN'; uncertain: boolean } {
  if (!raw || isUnknownValue(raw)) {
    return { value: 'UNKNOWN', uncertain: true };
  }
  const trimmed = raw.trim();
  const found = allowed.find((entry) => entry === trimmed);
  if (found) {
    return { value: found, uncertain: false };
  }
  return { value: 'UNKNOWN', uncertain: true };
}

const QUESTIONS: AdvisorQuestion[] = [
  {
    id: 'assetProfile',
    label: 'Quel scénario décrit le mieux votre situation actuelle ?',
    description: 'Cela nous aide à adapter les recommandations : société active, portefeuille immobilier, etc.',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'Je ne suis pas certain pour le moment' },
      { value: 'NONE', label: "Je ne possède pas encore d'actifs (aucune entreprise, aucun immeuble)" },
      { value: 'SALARIED_ONLY', label: 'Je suis salarié sans portefeuille immobilier' },
      {
        value: 'JOB_AND_PROPERTIES',
        label: 'Je suis salarié et je possède des immeubles (locatifs ou personnels avec revenus)'
      },
      { value: 'BUSINESS', label: 'Je gère principalement une entreprise (opco)' },
      {
        value: 'BUSINESS_AND_PROPERTIES',
        label: 'Entreprise + portefeuille immobilier (ex. opco + immeubles locatifs)'
      }
    ]
  },
  {
    id: 'taxableIncome',
    label: "Revenu imposable prévu pour l'exercice",
    description: 'Indiquez le revenu imposable estimé pour votre société (en dollars).',
    type: 'number',
    placeholder: 'Ex. 250000'
  },
  {
    id: 'profitMargin',
    label: 'Marge bénéficiaire moyenne',
    description: 'Calculez la marge nette en % sur les douze derniers mois.',
    type: 'number',
    placeholder: 'Ex. 22.5'
  },
  {
    id: 'province',
    label: "Province d'immatriculation principale",
    description: 'Certaines recommandations varient selon la fiscalité provinciale.',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'Je ne sais pas / à confirmer' },
      { value: 'QC', label: 'Québec' },
      { value: 'ON', label: 'Ontario' },
      { value: 'BC', label: 'Colombie-Britannique' },
      { value: 'AB', label: 'Alberta' },
      { value: 'OTHER', label: 'Autre province/territoire' }
    ]
  },
  {
    id: 'holdingStructure',
    label: 'Avez-vous une société de gestion (holding) ?',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'Je ne sais pas / à valider' },
      { value: 'YES', label: 'Oui' },
      { value: 'NO', label: 'Non' }
    ]
  },
  {
    id: 'dividendIntent',
    label: 'Intention de verser des dividendes aux actionnaires',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'À déterminer' },
      { value: 'NONE', label: 'Pas de dividendes prévus' },
      { value: 'LOW', label: 'Dividendes limités (moins de 50k)' },
      { value: 'HIGH', label: 'Dividendes significatifs (50k+)' }
    ]
  },
  {
    id: 'liquidityGoal',
    label: 'Objectif principal pour la trésorerie excédentaire',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'Je ne sais pas encore' },
      { value: 'STABILITY', label: 'Stabilité / fonds de roulement' },
      { value: 'GROWTH', label: 'Réinvestir pour croître' },
      { value: 'WITHDRAWAL', label: 'Retirer pour les actionnaires' }
    ]
  },
  {
    id: 'legalConcern',
    label: 'Préoccupation juridique prioritaire',
    type: 'select',
    options: [
      { value: 'UNKNOWN', label: 'Aucune idée pour le moment' },
      { value: 'NONE', label: 'Aucune préoccupation majeure' },
      { value: 'SUCCESSION', label: 'Planification successorale' },
      { value: 'LITIGATION', label: 'Risque de litige / conformité' }
    ]
  }
];

export function listAdvisorQuestions(): AdvisorQuestion[] {
  return QUESTIONS;
}

export function describeUncertainFacts(
  answers: AdvisorAnswer[],
  uncertain: Record<string, boolean>
): AdvisorUncertaintyField[] {
  if (!uncertain) {
    return [];
  }

  const answered = new Set(answers.map((answer) => answer.questionId));

  return QUESTIONS.filter((question) => uncertain[question.id] && answered.has(question.id)).map((question) => ({
    questionId: question.id,
    label: question.label,
    description: question.description
  }));
}

export function parseFacts(answers: AdvisorAnswer[]): AdvisorFacts {
  const answerMap = new Map(answers.map((item) => [item.questionId, item.value]));

  const uncertain: Record<string, boolean> = {};

  const taxableIncomeParsed = parseNumeric(answerMap.get('taxableIncome'));
  const profitMarginParsed = parseNumeric(answerMap.get('profitMargin'));

  if (taxableIncomeParsed.uncertain) {
    uncertain.taxableIncome = true;
  }
  if (profitMarginParsed.uncertain) {
    uncertain.profitMargin = true;
  }

  const provinceNormalized = normalizeSelectValue(answerMap.get('province'), ['QC', 'ON', 'BC', 'AB', 'OTHER']);
  const holdingNormalized = normalizeSelectValue(answerMap.get('holdingStructure'), ['YES', 'NO']);
  const dividendNormalized = normalizeSelectValue(answerMap.get('dividendIntent'), ['NONE', 'LOW', 'HIGH']);
  const liquidityNormalized = normalizeSelectValue(answerMap.get('liquidityGoal'), ['STABILITY', 'GROWTH', 'WITHDRAWAL']);
  const legalNormalized = normalizeSelectValue(answerMap.get('legalConcern'), ['NONE', 'SUCCESSION', 'LITIGATION']);
  const profileNormalized = normalizeSelectValue(answerMap.get('assetProfile'), [
    'NONE',
    'SALARIED_ONLY',
    'JOB_AND_PROPERTIES',
    'BUSINESS',
    'BUSINESS_AND_PROPERTIES'
  ]);

  if (provinceNormalized.uncertain) {
    uncertain.province = true;
  }
  if (holdingNormalized.uncertain) {
    uncertain.holdingStructure = true;
  }
  if (dividendNormalized.uncertain) {
    uncertain.dividendIntent = true;
  }
  if (liquidityNormalized.uncertain) {
    uncertain.liquidityGoal = true;
  }
  if (legalNormalized.uncertain) {
    uncertain.legalConcern = true;
  }
  if (profileNormalized.uncertain) {
    uncertain.assetProfile = true;
  }

  return {
    taxableIncome: typeof taxableIncomeParsed.value === 'number' ? taxableIncomeParsed.value : null,
    profitMargin:
      typeof profitMarginParsed.value === 'number' ? profitMarginParsed.value / 100 : null,
    province: provinceNormalized.value === 'UNKNOWN' ? null : provinceNormalized.value,
    hasHoldingCompany:
      holdingNormalized.value === 'UNKNOWN' ? null : holdingNormalized.value === 'YES',
    dividendIntent: dividendNormalized.value,
    liquidityGoal: liquidityNormalized.value,
    legalConcern: legalNormalized.value,
    assetProfile: profileNormalized.value,
    uncertain
  };
}

export function determineNextQuestion(answers: AdvisorAnswer[]): AdvisorQuestion | null {
  const answered = new Set(answers.map((answer) => answer.questionId));
  return QUESTIONS.find((question) => !answered.has(question.id)) ?? null;
}
