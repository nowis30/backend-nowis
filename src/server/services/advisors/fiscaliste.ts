import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runFiscalisteAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const income = parsed.taxableIncome ?? 0;
  const profitMargin = parsed.profitMargin ?? 0;

  const smallBusinessLimit = parsed.province === 'QC' ? 500_000 : 500_000;
  const thresholdExceeded = income > smallBusinessLimit;

  const effectiveTaxRate = thresholdExceeded ? 0.267 : 0.125;
  const sbdRetention = Math.max(0, smallBusinessLimit - income);

  const metrics: AdvisorMetric[] = [
    {
      id: 'effectiveTaxRate',
      label: 'Taux d’imposition effectif estimé',
      value: `${(effectiveTaxRate * 100).toFixed(1)} %`,
      explanation:
        thresholdExceeded
          ? "Au-delà de la limite de la déduction pour petites entreprises (500 k$), votre taux combiné fédéral/provincial grimpe autour de 26,7 %."
          : "Sous la limite de 500 k$, vous demeurez admissible au taux réduit (~12,5 % combiné).",
      expertIds: ['fiscaliste']
    },
    {
      id: 'sbdRoom',
      label: 'Espace SBD restant',
      value: sbdRetention > 0 ? `${(sbdRetention / 1000).toFixed(1)} k$` : 'Épuisé',
      explanation:
        sbdRetention > 0
          ? "Montant de revenu imposable restant avant d’atteindre la limite de la déduction pour petites entreprises."
          : "Votre revenu imposable dépasse déjà la limite. Un fractionnement via holding pourrait préserver le taux réduit.",
      expertIds: ['fiscaliste', 'planificateur']
    }
  ];

  const rationale: string[] = [];

  if (thresholdExceeded) {
    rationale.push(
      "Répartir une portion du résultat dans une société de gestion ou verser un bonus au dirigeant pour descendre sous 500 k$."
    );
  } else {
    rationale.push(
      "Maintenir vos bénéfices dans l’opco permet de profiter du taux réduit sur la prochaine année, tant que la croissance demeure sous 500 k$."
    );
  }

  if (profitMargin > 0.25) {
    rationale.push(
      "Une marge supérieure à 25 % laisse de la place pour un report de dividende afin de lisser le revenu personnel."
    );
  } else {
    rationale.push(
      "La marge est plus serrée; prévoyez un coussin fiscal pour éviter un effet d’escalier sur les acomptes provisionnels."
    );
  }

  const followUps: string[] = [];
  if (!parsed.hasHoldingCompany && thresholdExceeded) {
    followUps.push("Valider la création d’une holding pour gérer l’excès de liquidités et protéger l’admissibilité à la SBD.");
  }

  if (parsed.dividendIntent === 'HIGH') {
    followUps.push(
      "Réviser la convention unanime pour documenter la politique de dividendes et préparer les feuillets T5/RL-3."
    );
  }

  return {
    recommendation: {
      expertId: 'fiscaliste',
      title: 'Optimisation du revenu imposable',
      summary: thresholdExceeded
        ? "Vous dépassez la limite SBD : envisager une répartition du résultat ou un bonus pour ramener l’imposable sous 500 k$."
        : "Vous demeurez admissible à la SBD : conservez les profits dans l’opco et planifiez les retraits graduellement.",
      rationale
    },
    metrics,
    followUps
  };
}
