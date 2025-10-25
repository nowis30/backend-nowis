import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

function computeWorkingCapitalCoverage(income: number, margin: number): number {
  const annualCash = income * margin;
  const monthlyCash = annualCash / 12;
  const baselineBurn = Math.max(15_000, income * 0.1 / 12);
  return monthlyCash / baselineBurn;
}

export function runComptableAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const income = context.parsed.taxableIncome ?? 0;
  const margin = context.parsed.profitMargin ?? 0;

  const coverage = computeWorkingCapitalCoverage(income, margin);
  const healthyCoverage = coverage >= 6 ? 'Solide' : coverage >= 3 ? 'Intermédiaire' : 'À renforcer';

  const optimalRemuneration = Math.min(income * 0.35, 120_000);

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

  const rationale: string[] = [];
  if (coverage < 3) {
    rationale.push(
      'Augmenter les liquidités courantes (ligne de crédit, affacturage ou réduction des dépenses discrétionnaires).'
    );
  } else {
    rationale.push('La trésorerie couvre plusieurs mois : possibilité de planifier un réinvestissement stratégique.');
  }

  if (margin < 0.15) {
    rationale.push("La marge est inférieure à 15 % : investiguer les postes de dépenses et revoir la tarification.");
  } else {
    rationale.push('La marge est satisfaisante : maintenir les contrôles budgétaires actuels et les flux de projection.');
  }

  const followUps: string[] = [];
  if (coverage < 6) {
    followUps.push('Préparer un budget de trésorerie mensuel sur 12 mois pour surveiller l’amélioration de la couverture.');
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
