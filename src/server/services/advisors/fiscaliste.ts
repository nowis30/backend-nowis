import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runFiscalisteAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const incomeKnown = typeof parsed.taxableIncome === 'number';
  const income = incomeKnown ? parsed.taxableIncome! : 0;
  const marginKnown = typeof parsed.profitMargin === 'number';
  const profitMargin = marginKnown ? parsed.profitMargin! : 0;
  const profile = parsed.assetProfile === 'UNKNOWN' ? null : parsed.assetProfile;
  const hasHolding = parsed.hasHoldingCompany === true;
  const holdingUnknown = parsed.hasHoldingCompany === null;

  if (profile === 'NONE') {
    return {
      recommendation: {
        expertId: 'fiscaliste',
        title: 'Préparer le terrain fiscal',
        summary:
          "Aucun revenu imposable ni actif corporatif pour l’instant : concentrez-vous sur la mise en place de la structure avant d’engendrer des revenus.",
        rationale: [
          'Valider le choix de la province d’incorporation et des actionnaires avant le démarrage.',
          'Préparer un budget de démarrage afin de savoir quand la déduction pour petites entreprises deviendra pertinente.'
        ]
      },
      metrics: [
        {
          id: 'currentTaxExposure',
          label: 'Revenu imposable actuel',
          value: '0 $',
          explanation: "Aucun revenu déclaré : les recommandations seront activées dès que des entrées seront prévues.",
          expertIds: ['fiscaliste']
        }
      ],
      followUps: [
        'Mettre en place un calendrier des premières obligations fiscales (TPS/TVQ, acomptes provisionnels, DAS).'
      ]
    };
  }

  if (!incomeKnown) {
    return {
      recommendation: {
        expertId: 'fiscaliste',
        title: 'Estimer le revenu imposable',
        summary:
          "Le revenu imposable n’est pas connu : établissez une projection pour déterminer vos acomptes et l'admissibilité à la SBD.",
        rationale: [
          'Prévoir un budget de ventes et de dépenses pour calculer un revenu imposable prévisionnel.',
          'Identifier les seuils fiscaux (SBD, cotisations) qui s’appliqueront selon la projection.'
        ]
      },
      metrics: [
        {
          id: 'taxableIncomeStatus',
          label: 'Revenu imposable estimé',
          value: 'Inconnu',
          explanation: 'Aucune estimation fournie — la prochaine étape est de bâtir une projection annuelle.',
          expertIds: ['fiscaliste']
        }
      ],
      followUps: ['Préparer un état des résultats prévisionnel sur 12 mois pour verrouiller la stratégie fiscale.']
    };
  }

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

  if (!marginKnown) {
    metrics.push({
      id: 'profitMarginStatus',
      label: 'Marge nette',
      value: 'À confirmer',
      explanation: 'La marge bénéficiaire estimée est inconnue — validez vos coûts pour affiner la stratégie de rémunération.',
      expertIds: ['fiscaliste', 'comptable']
    });
  }

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

  if (!marginKnown) {
    rationale.push('Confirmer la marge nette afin de valider le choix salaire/dividende.');
  }

  const followUps: string[] = [];
  if (!hasHolding && thresholdExceeded) {
    followUps.push("Valider la création d’une holding pour gérer l’excès de liquidités et protéger l’admissibilité à la SBD.");
  }

  if (parsed.dividendIntent === 'HIGH') {
    followUps.push(
      "Réviser la convention unanime pour documenter la politique de dividendes et préparer les feuillets T5/RL-3."
    );
  }

  if (parsed.dividendIntent === 'UNKNOWN') {
    followUps.push('Clarifier la politique de dividendes pour optimiser la combinaison salaire/dividende.');
  }

  if (holdingUnknown) {
    followUps.push('Confirmer si une société de gestion existe afin d’ajuster la stratégie fiscale.');
  }

  if (profile === 'JOB_AND_PROPERTIES' || profile === 'BUSINESS_AND_PROPERTIES') {
    followUps.push('Analyser la répartition revenus locatifs vs. revenus actifs pour protéger la déduction pour petites entreprises.');
  }

  if (profile === 'SALARIED_ONLY') {
    followUps.push('Comparer la rémunération salariale actuelle avec un éventuel transfert d’actifs dans une holding personnelle.');
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
