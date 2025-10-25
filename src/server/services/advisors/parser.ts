import { AdvisorAnswer, AdvisorFacts, AdvisorQuestion } from './types';

const QUESTIONS: AdvisorQuestion[] = [
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
      { value: 'YES', label: 'Oui' },
      { value: 'NO', label: 'Non' }
    ]
  },
  {
    id: 'dividendIntent',
    label: 'Intention de verser des dividendes aux actionnaires',
    type: 'select',
    options: [
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
      { value: 'NONE', label: 'Aucune préoccupation majeure' },
      { value: 'SUCCESSION', label: 'Planification successorale' },
      { value: 'LITIGATION', label: 'Risque de litige / conformité' }
    ]
  }
];

export function listAdvisorQuestions(): AdvisorQuestion[] {
  return QUESTIONS;
}

export function parseFacts(answers: AdvisorAnswer[]): AdvisorFacts {
  const answerMap = new Map(answers.map((item) => [item.questionId, item.value]));

  const taxableIncomeRaw = answerMap.get('taxableIncome') ?? '';
  const profitMarginRaw = answerMap.get('profitMargin') ?? '';

  const taxableIncome = Number(taxableIncomeRaw);
  const profitMargin = Number(profitMarginRaw);

  return {
    taxableIncome: Number.isFinite(taxableIncome) ? taxableIncome : null,
    profitMargin: Number.isFinite(profitMargin) ? profitMargin / 100 : null,
    province: (answerMap.get('province') as string | undefined) ?? null,
    hasHoldingCompany: (answerMap.get('holdingStructure') ?? 'NO') === 'YES',
    dividendIntent: ((answerMap.get('dividendIntent') as AdvisorFacts['dividendIntent']) ?? 'NONE'),
    liquidityGoal: ((answerMap.get('liquidityGoal') as AdvisorFacts['liquidityGoal']) ?? 'STABILITY'),
    legalConcern: ((answerMap.get('legalConcern') as AdvisorFacts['legalConcern']) ?? 'NONE')
  };
}

export function determineNextQuestion(answers: AdvisorAnswer[]): AdvisorQuestion | null {
  const answered = new Set(answers.map((answer) => answer.questionId));
  return QUESTIONS.find((question) => !answered.has(question.id)) ?? null;
}
