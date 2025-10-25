import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runAvocatAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const legal = parsed.legalConcern;
  const hasHolding = parsed.hasHoldingCompany === true;
  const holdingUnknown = parsed.hasHoldingCompany === null;
  const profile = parsed.assetProfile === 'UNKNOWN' ? null : parsed.assetProfile;

  if (profile === 'NONE') {
    return {
      recommendation: {
        expertId: 'avocat',
        title: 'Mettre en place la structure juridique de base',
        summary: 'Aucun actif détenu : prévoyez les documents constitutifs (incorporation, conventions, testaments) avant l’acquisition.',
        rationale: [
          'Rédiger un testament et un mandat de protection pour encadrer la croissance future.',
          'Choisir entre entreprise individuelle et incorporation dès que des contrats ou immeubles seront acquis.'
        ]
      },
      metrics: [
        {
          id: 'legalReadiness',
          label: 'Préparation juridique',
          value: 'À initier',
          explanation: 'Aucune structure en place : préparez la documentation (statuts, conventions, baux types) avant de signer vos premiers contrats.',
          expertIds: ['avocat']
        }
      ],
      followUps: ['Consulter un juriste pour choisir la bonne forme juridique dès que vous signez un premier bail ou contrat.']
    };
  }

  const protectionScore = hasHolding ? 82 : holdingUnknown ? 65 : 58;

  const metrics: AdvisorMetric[] = [
    {
      id: 'assetProtectionScore',
      label: 'Indice de protection d’actifs',
      value: `${protectionScore} / 100`,
      explanation:
        hasHolding
          ? "La présence d’une holding améliore la protection des actifs (séparation entre opératrice et patrimoine)."
          : holdingUnknown
            ? 'Holding à confirmer — la séparation des actifs reste à valider.'
            : "Sans holding, les actifs d’exploitation et excédentaires sont exposés en cas de litige.",
      expertIds: ['avocat']
    }
  ];

  const rationale: string[] = [];

  switch (legal) {
    case 'SUCCESSION':
      rationale.push('Mettre à jour le gel successoral et prévoir des conventions d’achat-vente entre actionnaires.');
      metrics.push({
        id: 'successionReadiness',
        label: 'Préparation successorale',
        value: 'À planifier',
        explanation: 'Aucun mandat en cours — prévoir un plan de relève et la documentation correspondante.',
        expertIds: ['avocat', 'planificateur']
      });
      break;
    case 'LITIGATION':
      rationale.push('Valider les clauses d’indemnisation et couvrir les administrateurs (D&O).');
      metrics.push({
        id: 'litigationExposure',
        label: 'Exposition potentielle aux litiges',
        value: 'Élevée',
        explanation: 'Présence de risques déclarés — s’assurer d’un protocole de conservation des preuves et assurance D&O.',
        expertIds: ['avocat']
      });
      break;
    case 'UNKNOWN':
      rationale.push('Identifier la principale préoccupation juridique (succession, litige, conformité) pour cibler les actions.');
      metrics.push({
        id: 'legalFocus',
        label: 'Priorité juridique',
        value: 'À déterminer',
        explanation: 'La priorité n’est pas définie — planifier une rencontre pour clarifier les risques et obligations.',
        expertIds: ['avocat']
      });
      break;
    default:
      rationale.push('Maintenir la conformité annuelle (livres corporatifs, résolutions, registre des bénéficiaires effectifs).');
      metrics.push({
        id: 'complianceStatus',
        label: 'État de conformité corporative',
        value: 'À jour',
        explanation: 'Aucun enjeu juridique signalé — poursuivre la tenue de livres annuelle.',
        expertIds: ['avocat']
      });
      break;
  }

  const followUps: string[] = [];
  if (!hasHolding) {
    followUps.push("Étudier la création d’une holding de protection et mettre à jour les conventions d’actionnaires.");
  }
  if (legal === 'SUCCESSION') {
    followUps.push('Mandater un notaire pour reprendre le plan successoral et les fiducies familiales.');
  }
  if (legal === 'LITIGATION') {
    followUps.push('Organiser un audit juridique des contrats majeurs et mettre en place un protocole de litige.');
  }
  if (legal === 'UNKNOWN') {
    followUps.push('Cartographier les risques juridiques (contrats, succession, gouvernance) pour prioriser les interventions.');
  }
  if (holdingUnknown) {
    followUps.push('Confirmer la structure corporative pour ajuster la protection des actifs.');
  }
  if (profile === 'JOB_AND_PROPERTIES') {
    followUps.push('Mettre en place des baux écrits et assurances responsabilité pour le parc immobilier détenu à titre personnel.');
  }
  if (profile === 'BUSINESS_AND_PROPERTIES') {
    followUps.push('Séparer Immobilier et Opérations via contrats de location inter-sociétés pour limiter l’exposition légale.');
  }

  return {
    recommendation: {
      expertId: 'avocat',
      title: 'Protection légale',
      summary:
        legal === 'SUCCESSION'
          ? 'Priorité à la succession : actualiser le gel et sécuriser la relève.'
          : legal === 'LITIGATION'
            ? 'Risque de litige identifié : protéger les administrateurs et documenter les procédures.'
            : legal === 'UNKNOWN'
              ? 'Clarifier vos risques juridiques pour cibler les prochaines démarches.'
              : 'Conformité maintenue : poursuivre la gouvernance et la mise à jour annuelle.',
      rationale
    },
    metrics,
    followUps
  };
}
