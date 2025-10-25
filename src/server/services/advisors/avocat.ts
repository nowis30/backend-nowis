import { AdvisorContext, AdvisorMetric, AdvisorModuleOutput } from './types';

export function runAvocatAdvisor(context: AdvisorContext): AdvisorModuleOutput {
  const { parsed } = context;
  const legal = parsed.legalConcern;
  const hasHolding = parsed.hasHoldingCompany;

  const protectionScore = hasHolding ? 82 : 58;

  const metrics: AdvisorMetric[] = [
    {
      id: 'assetProtectionScore',
      label: 'Indice de protection d’actifs',
      value: `${protectionScore} / 100`,
      explanation:
        hasHolding
          ? "La présence d’une holding améliore la protection des actifs (séparation entre opératrice et patrimoine)."
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

  return {
    recommendation: {
      expertId: 'avocat',
      title: 'Protection légale',
      summary:
        legal === 'SUCCESSION'
          ? 'Priorité à la succession : actualiser le gel et sécuriser la relève.'
          : legal === 'LITIGATION'
            ? 'Risque de litige identifié : protéger les administrateurs et documenter les procédures.'
            : 'Conformité maintenue : poursuivre la gouvernance et la mise à jour annuelle.',
      rationale
    },
    metrics,
    followUps
  };
}
