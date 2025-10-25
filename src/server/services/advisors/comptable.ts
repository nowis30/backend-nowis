import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

function computeWorkingCapitalCoverage(income: number, margin: number): number {
  const annualCash = income * margin;
  const monthlyCash = annualCash / 12;
  const baselineBurn = Math.max(15_000, income * 0.1 / 12);
  return monthlyCash / baselineBurn;
}

export function runComptableAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const incomeValue = context.parsed.taxableIncome;
  const marginValue = context.parsed.profitMargin;
  const incomeKnown = typeof incomeValue === 'number' && incomeValue > 0;
  const marginKnown = typeof marginValue === 'number' && marginValue > 0;
  const profile = context.parsed.assetProfile === 'UNKNOWN' ? null : context.parsed.assetProfile;

  if (profile === 'NONE' || !incomeKnown) {
    return {
      recommendation: {
        expertId: 'comptable',
        title: 'Mettre en place les fondations comptables',
        summary:
          'Aucune donnée financière active détectée : mettez sur pied un plan comptable et un suivi de caisse avant le démarrage.',
        rationale: [
          'Choisir un logiciel comptable et définir les catégories de dépenses dès maintenant évitera les rattrapages coûteux.',
          'Élaborer un budget prévisionnel pour savoir quand l’entreprise atteindra le seuil de rentabilité.'
        ]
      },
      metrics: [
        {
          id: 'bookkeepingReadiness',
          label: 'Préparation des registres',
          value: 'À configurer',
          explanation: 'Aucun flux comptable à analyser — configurez la comptabilité et un tableau de bord minimal avant les premières ventes.',
          expertIds: ['comptable']
        }
      ],
      followUps: ['Mettre en place un compte professionnel distinct et une procédure simple de conservation des reçus.']
    };
  }

  const coverage = computeWorkingCapitalCoverage(incomeValue!, marginKnown ? marginValue! : 0.2);
  const healthyCoverage = coverage >= 6 ? 'Solide' : coverage >= 3 ? 'Intermédiaire' : 'À renforcer';

  const optimalRemuneration = Math.min(incomeValue! * 0.35, 120_000);

  const metrics: AdvisorMetric[] = [
    {
      id: 'workingCapitalCoverage',
      label: 'Mois de couverture du fonds de roulement',
      value: coverage === Infinity ? 'Infini' : coverage.toFixed(1),
      explanation:
        "Nombre de mois pendant lesquels la société peut couvrir ses frais fixes avec les flux actuels (revenu imposable × marge nette).",
      expertIds: ['comptable']
    },
    {
      id: 'recommendedRemuneration',
      label: 'Rémunération recommandée du dirigeant',
      value: `${Math.round(optimalRemuneration).toLocaleString('fr-CA')} $`,
      explanation:
        "Calcul heuristique basé sur 35 % du revenu imposable, plafonné à 120 k$, pour équilibrer salaire et dividendes.",
      expertIds: ['comptable', 'fiscaliste']
    }
  ];

  if (!marginKnown) {
    metrics.push({
      id: 'profitMarginInsight',
      label: 'Marge nette',
      value: 'À valider',
      explanation: 'La marge nette n’a pas été fournie — ajustez vos projections pour obtenir un ratio précis.',
      expertIds: ['comptable']
    });
  }

  const rationale: string[] = [];
  if (coverage < 3) {
    rationale.push(
      'Augmenter les liquidités courantes (ligne de crédit, affacturage ou réduction des dépenses discrétionnaires).'
    );
  } else {
    rationale.push('La trésorerie couvre plusieurs mois : possibilité de planifier un réinvestissement stratégique.');
  }

  if (marginKnown && marginValue! < 0.15) {
    rationale.push("La marge est inférieure à 15 % : investiguer les postes de dépenses et revoir la tarification.");
  } else {
    rationale.push('La marge est satisfaisante : maintenir les contrôles budgétaires actuels et les flux de projection.');
  }

  if (!marginKnown) {
    rationale.push('Obtenir une marge nette estimée pour affiner les projections de trésorerie.');
  }

  const followUps: string[] = [];
  if (coverage < 6) {
    followUps.push('Préparer un budget de trésorerie mensuel sur 12 mois pour surveiller l’amélioration de la couverture.');
  }

  if (profile === 'JOB_AND_PROPERTIES' || profile === 'BUSINESS_AND_PROPERTIES') {
    followUps.push('Créer un suivi distinct des immeubles (revenus/charges par adresse) pour faciliter les déclarations et la gestion de flux.');
  }

  if (!marginKnown) {
    followUps.push('Collecter les états financiers récents pour calculer la marge nette.');
  }

  return {
    recommendation: {
      expertId: 'comptable',
      title: 'Santé opérationnelle',
      summary:
        coverage < 3
          ? 'La couverture du fonds de roulement est fragile : sécuriser la trésorerie avant de distribuer des dividendes.'
          : 'La couverture de trésorerie est adéquate : envisager un budget de croissance et un plan de rémunération.',
      rationale
    },
    metrics,
    followUps
  };
}
