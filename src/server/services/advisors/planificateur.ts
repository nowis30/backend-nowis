import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runPlanificateurAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const liquidityGoal = parsed.liquidityGoal;
  const intent = parsed.dividendIntent;
  const hasHolding = parsed.hasHoldingCompany === true;
  const holdingUnknown = parsed.hasHoldingCompany === null;
  const profile = parsed.assetProfile === 'UNKNOWN' ? null : parsed.assetProfile;

  if (profile === 'NONE') {
    return {
      recommendation: {
        expertId: 'planificateur',
        title: 'Clarifier les objectifs financiers',
        summary: 'Définissez vos objectifs (revenu, immobilier, entreprise) avant de construire un plan de capitalisation.',
        rationale: [
          'Établir un budget personnel et une cible d’épargne mensuelle avant de constituer des actifs.',
          'Identifier le premier actif stratégique (fonds d’urgence, première propriété, incorporation) pour donner une direction à l’investissement.'
        ]
      },
      metrics: [
        {
          id: 'goalSettingStatus',
          label: 'Plan financier initial',
          value: 'À définir',
          explanation: 'Aucun actif recensé : commencez par fixer un objectif de capitalisation et un horizon temporel.',
          expertIds: ['planificateur']
        }
      ],
      followUps: ['Planifier une rencontre de découverte pour documenter les revenus, dépenses et ambitions à 12-24 mois.']
    };
  }

  let reinvestmentRatio: number | null = null;
  switch (liquidityGoal) {
    case 'GROWTH':
      reinvestmentRatio = 0.7;
      break;
    case 'STABILITY':
      reinvestmentRatio = 0.5;
      break;
    case 'WITHDRAWAL':
      reinvestmentRatio = 0.3;
      break;
    default:
      reinvestmentRatio = null;
      break;
  }

  let dividendBuffer: number | null = null;
  switch (intent) {
    case 'HIGH':
      dividendBuffer = 0.4;
      break;
    case 'LOW':
      dividendBuffer = 0.25;
      break;
    case 'NONE':
      dividendBuffer = 0.1;
      break;
    default:
      dividendBuffer = null;
      break;
  }

  const metrics: AdvisorMetric[] = [
    {
      id: 'recommendedReinvestment',
      label: 'Part des profits à réinvestir',
      value: reinvestmentRatio === null ? 'À déterminer' : `${Math.round(reinvestmentRatio * 100)} %`,
      explanation:
        reinvestmentRatio === null
          ? 'Objectif de trésorerie non précisé — définir la priorité avant de répartir les profits.'
          : "Heuristique basée sur votre objectif : croissance → 70 %, stabilité → 50 %, retrait → 30 %.",
      expertIds: ['planificateur']
    },
    {
      id: 'dividendBuffer',
      label: 'Coussin de liquidités avant dividendes',
      value:
        dividendBuffer === null
          ? 'À préciser'
          : `${Math.round(dividendBuffer * 100)} % du revenu imposable`,
      explanation:
        dividendBuffer === null
          ? 'Politique de dividendes à définir — déterminer le pourcentage de profits à conserver avant tout retrait.'
          : "Pour sécuriser la trésorerie, on recommande de conserver ce pourcentage des profits avant toute distribution.",
      expertIds: ['planificateur', 'fiscaliste']
    }
  ];

  const rationale: string[] = [];

  if (!hasHolding) {
    rationale.push("Sans holding, privilégiez les placements passifs à l’intérieur de l’opco ou via un régime de retraite individuel.");
  } else {
    rationale.push('La holding peut servir de coffre-fort : réalisez des transferts inter-sociétés pour compartimenter les risques.');
  }

  if (holdingUnknown) {
    rationale.push('Confirmer la présence d’une holding pour planifier la stratégie de décaissement.');
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
    case 'UNKNOWN':
      rationale.push('Déterminer si la priorité est la croissance, la stabilité ou les retraits afin de calibrer la stratégie.');
      break;
    default:
      break;
  }

  const followUps: string[] = [];
  if (intent !== 'NONE' && intent !== 'UNKNOWN' && !hasHolding) {
    followUps.push("Analyser l’ouverture d’une holding pour verser des dividendes inter-sociétés sans incidence fiscale immédiate.");
  }
  if (liquidityGoal === 'WITHDRAWAL') {
    followUps.push('Élaborer un plan de retraite corporatif (REER collectif, CRI, RRI) pour les principaux actionnaires.');
  }
  if (intent === 'UNKNOWN') {
    followUps.push('Clarifier les besoins de revenus personnels pour fixer la politique de dividendes.');
  }
  if (liquidityGoal === 'UNKNOWN') {
    followUps.push('Hiérarchiser les priorités de trésorerie (croissance, stabilité, retraits) avant de fixer un ratio de réinvestissement.');
  }
  if (profile === 'JOB_AND_PROPERTIES') {
    followUps.push('Créer un plan d’amortissement et de refinancement pour vos immeubles en lien avec votre revenu salarial.');
  }
  if (profile === 'SALARIED_ONLY') {
    followUps.push('Évaluer la pertinence de cotisations REER/CELI vs. mise de fonds pour un premier immeuble.');
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
            : liquidityGoal === 'UNKNOWN'
              ? 'Déterminer vos priorités de trésorerie pour structurer le plan financier.'
              : 'Stabiliser la trésorerie tout en gardant de la flexibilité pour les opportunités.',
      rationale
    },
    metrics,
    followUps
  };
}
