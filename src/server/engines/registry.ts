import { evaluateAdvisors, getAdvisorQuestions } from '../services/advisors/coordinator';
import { calculateCorporateTaxReturn } from '../services/tax/corporateTaxEngine';
import { calculatePersonalTaxReturn, type PersonalTaxInput } from '../services/tax/personalTaxEngine';
import {
  computeCompanyValuation,
  createValuationSnapshot,
  deleteValuationSnapshot,
  listValuationSnapshots
} from '../services/valuationEngineService';
import {
  buildFamilyWealthHistory,
  buildFamilyWealthOverview,
  runFamilyWealthScenario,
  runFamilyWealthStressTest
} from '../services/wealth/familyWealthService';
import {
  calculateLeveragedBuyback,
  buildLeveragedBuybackResolution,
  normalizeLeveragedBuybackInput
} from '../services/leveragedBuybackService';
import { createFreezeSimulation } from '../services/freezeService';
import { instrumentEngineExecution } from './instrumentation';
import { deriveProfileInsights } from '../services/profileInsightsService';
import { getProfileSummary } from '../services/profileSummaryService';
import { getProfileDashboard } from '../services/profileDashboardService';
import { buildSuccessionProgressReport } from '../services/successionProgressService';
import {
  type AdvisorEngineContract,
  type EngineContext,
  type EngineRegistry,
  type LeveragedFinanceEngineContract,
  type ProfileEngineContract,
  type SuccessionEngineContract,
  type TaxEngineContract,
  type ValuationEngineContract,
  type WealthEngineContract
} from './contracts';

function requireUserId(context: EngineContext): number {
  if (!Number.isFinite(context.userId)) {
    throw new Error('EngineContext.userId is required');
  }
  return context.userId;
}

const advisorEngine: AdvisorEngineContract = {
  descriptor: {
    id: 'advisor',
    label: 'Advisor Engine',
    version: '1.0.0',
    category: 'advice',
  description: 'Guide interactif multi-experts (fiscal, comptable, planification, juridique).'
  },
  async listQuestions() {
    return getAdvisorQuestions().map((question) => ({
      ...question,
      options: question.options ? question.options.map((option) => ({ ...option })) : undefined
    }));
  },
  evaluate(_context, answers, options) {
    return evaluateAdvisors(answers, options);
  }
};

const taxEngine: TaxEngineContract = {
  descriptor: {
    id: 'tax',
    label: 'Tax Engine',
    version: '1.0.0',
    category: 'compliance',
    description: 'Calculs fiscaux corporatifs et personnels (federal + provinces principales).'
  },
  runCorporateReturn(context, input) {
    requireUserId(context);
    return calculateCorporateTaxReturn(input.companyId, input.fiscalYearEnd);
  },
  runPersonalReturn(context, input: PersonalTaxInput) {
    requireUserId(context);
    return calculatePersonalTaxReturn(input);
  }
};

const valuationEngine: ValuationEngineContract = {
  descriptor: {
    id: 'valuation',
    label: 'Valuation Engine',
    version: '1.0.0',
    category: 'valuation',
    description: 'Valorisation corporative, snapshots et exports financiers.'
  },
  compute(context, input) {
    return computeCompanyValuation({
      userId: requireUserId(context),
      companyId: input.companyId,
      valuationDate: input.valuationDate ?? context.asOf
    });
  },
  createSnapshot(context, input) {
    return createValuationSnapshot({
      userId: requireUserId(context),
      companyId: input.companyId,
      valuationDate: input.valuationDate,
      notes: input.notes ?? null
    });
  },
  listSnapshots(context, filters) {
    return listValuationSnapshots(requireUserId(context), filters?.companyId);
  },
  deleteSnapshot(context, snapshotId) {
    return deleteValuationSnapshot(requireUserId(context), snapshotId);
  }
};

const wealthEngine: WealthEngineContract = {
  descriptor: {
    id: 'wealth',
    label: 'Wealth Engine',
    version: '1.0.0',
    category: 'planning',
    description: 'Vue globale du patrimoine familial, scenarios et stress tests.'
  },
  buildOverview(context, options) {
    const userId = requireUserId(context);
    return buildFamilyWealthOverview(userId, {
      asOf: options?.asOf ?? context.asOf,
      year: options?.year,
      persistSnapshot: options?.persistSnapshot ?? false
    });
  },
  buildHistory(context) {
    return buildFamilyWealthHistory(requireUserId(context));
  },
  runScenario(context, input, options) {
    return runFamilyWealthScenario(requireUserId(context), input, options);
  },
  runStressTest(context, input) {
    return runFamilyWealthStressTest(requireUserId(context), input);
  }
};

const leveragedFinanceEngine: LeveragedFinanceEngineContract = {
  descriptor: {
    id: 'leveraged-finance',
    label: 'Leveraged Finance Engine',
    version: '1.0.0',
    category: 'financing',
    description: "Simulation de rachat d'actions finance par emprunt."
  },
  normalize: normalizeLeveragedBuybackInput,
  async compute(_context, input) {
    return calculateLeveragedBuyback(input);
  },
  formatResolution(scenario, actorName) {
    return buildLeveragedBuybackResolution(scenario, actorName);
  }
};

const successionEngine: SuccessionEngineContract = {
  descriptor: {
    id: 'succession',
    label: 'Succession Engine',
    version: '0.1.0',
    category: 'succession',
    description: 'Gel successoral, simulations fiduciaires et rapports planifies.'
  },
  async runSimulation(context, input) {
    const userId = requireUserId(context);
    return instrumentEngineExecution(
      {
        engineId: 'succession',
        action: 'runSimulation',
        userId,
        metadata: {
          scenarioId: input.scenarioId,
          targetFreezeYear: input.targetFreezeYear,
          generations: input.generations
        }
      },
      async () => {
        const summary = await createFreezeSimulation(userId, input);
        if (!summary) {
          throw new Error('Freeze scenario not found or unauthorized for user');
        }
        return summary;
      },
      (summary) => ({
        simulationId: summary.id,
        redemptions: summary.redemptions.length,
        dividends: summary.dividends.length,
        beneficiaries: summary.beneficiaryResults.length
      })
    );
  },
  async getProgress(context) {
    const userId = requireUserId(context);
    return instrumentEngineExecution(
      {
        engineId: 'succession',
        action: 'getProgress',
        userId
      },
      async () => buildSuccessionProgressReport(userId),
      (report) => ({
        completionRatio: report.completionRatio,
        nextStep: report.nextAction.stepId
      })
    );
  }
};

const profileEngine: ProfileEngineContract = {
  descriptor: {
    id: 'profile',
    label: 'Profile Engine',
    version: '1.0.0',
    category: 'profile',
    description: 'Synthese profil, insights et tableau de bord consolide.'
  },
  async buildSummary(context) {
    return getProfileSummary(requireUserId(context));
  },
  deriveInsights(summary) {
    return deriveProfileInsights(summary);
  },
  buildDashboard(context) {
    return getProfileDashboard(requireUserId(context));
  }
};

const engineRegistry: EngineRegistry = Object.freeze({
  advisor: advisorEngine,
  tax: taxEngine,
  valuation: valuationEngine,
  wealth: wealthEngine,
  'leveraged-finance': leveragedFinanceEngine,
  succession: successionEngine,
  profile: profileEngine
});

export function getEngineRegistry(): EngineRegistry {
  return engineRegistry;
}

export function getEngine<K extends keyof EngineRegistry>(engine: K): EngineRegistry[K] {
  return engineRegistry[engine];
}
