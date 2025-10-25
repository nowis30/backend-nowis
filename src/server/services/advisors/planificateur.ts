import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runPlanificateurAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const liquidityGoal = parsed.liquidityGoal;
  const intent = parsed.dividendIntent;
  const hasHolding = parsed.hasHoldingCompany;

  const reinvestmentRatio = liquidityGoal === 'GROWTH' ? 0.7 : liquidityGoal === 'STABILITY' ? 0.5 : 0.3;
  const dividendBuffer = intent === 'HIGH' ? 0.4 : intent === 'LOW' ? 0.25 : 0.1;

  const metrics: AdvisorMetric[] = [
    {
      id: 'recommendedReinvestment',
      label: 'Part des profits à réinvestir',
      value: `${Math.round(reinvestmentRatio * 100)} %`,
      explanation:
        "Heuristique basée sur votre objectif : croissance → 70 %, stabilité → 50 %, retrait → 30 %.",
      expertIds: ['planificateur']
    },
    {
      id: 'dividendBuffer',
      label: 'Coussin de liquidités avant dividendes',
      value: `${Math.round(dividendBuffer * 100)} % du revenu imposable`,
      explanation:
        "Pour sécuriser la trésorerie, on recommande de conserver ce pourcentage des profits avant toute distribution.",
      expertIds: ['planificateur', 'fiscaliste']
    }
  ];

  const rationale: string[] = [];

  if (!hasHolding) {
    rationale.push("Sans holding, privilégiez les placements passifs à l’intérieur de l’opco ou via un régime de retraite individuel.");
  } else {
    rationale.push('La holding peut servir de coffre-fort : réalisez des transferts inter-sociétés pour compartimenter les risques.');
  }

  switch (liquidityGoal) {
    case 'GROWTH':
      rationale.push('Prioriser les projets à ROI > 12 % et retarder les dividendes pour 18 mois.');
      break;
    case 'STABILITY':
      rationale.push('Consolider un fonds de prévoyance équivalent à 6 mois de frais fixes.');
      break;
    case 'WITHDRAWAL':
      rationale.push('Structurer un plan de décaissement échelonné avec suivi trimestriel des ratios de liquidité.');
      break;
    default:
      break;
  }

  const followUps: string[] = [];
  if (intent !== 'NONE' && !hasHolding) {
    followUps.push("Analyser l’ouverture d’une holding pour verser des dividendes inter-sociétés sans incidence fiscale immédiate.");
  }
  if (liquidityGoal === 'WITHDRAWAL') {
    followUps.push('Élaborer un plan de retraite corporatif (REER collectif, CRI, RRI) pour les principaux actionnaires.');
  }

  return {
    recommendation: {
      expertId: 'planificateur',
      title: 'Vision financière',
      summary:
        liquidityGoal === 'GROWTH'
          ? 'Renforcer le réinvestissement et limiter les dividendes pendant la phase de croissance.'
          : liquidityGoal === 'WITHDRAWAL'
            ? 'Organiser les retraits en s’assurant d’un coussin de sécurité et d’une holding pour optimiser l’impôt.'
            : 'Stabiliser la trésorerie tout en gardant de la flexibilité pour les opportunités.',
      rationale
    },
    metrics,
    followUps
  };
}
