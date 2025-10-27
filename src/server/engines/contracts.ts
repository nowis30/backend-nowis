import type {
  AdvisorAnswer,
  AdvisorQuestion,
  AdvisorResult,
  EvaluateAdvisorsOptions
} from '../services/advisors/types';
import type {
  CorporateTaxComputation
} from '../services/tax/corporateTaxEngine';
import type {
  PersonalTaxComputation,
  PersonalTaxInput
} from '../services/tax/personalTaxEngine';
import type {
  ValuationComputation,
  ValuationSnapshotDto
} from '../services/valuationEngineService';
import type {
  LeveragedBuybackComputation,
  LeveragedBuybackInput,
  LeveragedBuybackNormalizedInput,
  LeveragedBuybackScenarioDto
} from '../services/leveragedBuybackService';
import type {
  FamilyWealthHistoryPoint,
  FamilyWealthOverview,
  FamilyWealthScenarioInput,
  FamilyWealthScenarioResult,
  StressTestInput,
  StressTestResult
} from '../services/wealth/familyWealthService';
import type {
  FreezeSimulationInput,
  FreezeSimulationSummary
} from '../services/freezeService';
import type { SuccessionProgressReport } from '../services/successionProgressService';
import type { ProfileInsight } from '../services/profileInsightsService';
import type { ProfileSummary } from '../services/profileSummaryService';
import type { ProfileDashboardPayload } from '../services/profileDashboardService';

export type EngineId =
  | 'advisor'
  | 'tax'
  | 'valuation'
  | 'wealth'
  | 'leveraged-finance'
  | 'succession'
  | 'profile';

export interface EngineDescriptor {
  id: EngineId | string;
  label: string;
  version: string;
  category?: string;
  description?: string;
  tags?: string[];
}

export interface EngineContext {
  userId: number;
  asOf?: Date;
  locale?: string;
  timezone?: string;
  requestId?: string;
}

export interface EngineContractBase {
  readonly descriptor: EngineDescriptor;
}

export interface AdvisorEngineContract extends EngineContractBase {
  listQuestions(context: EngineContext): Promise<AdvisorQuestion[]>;
  evaluate(
    context: EngineContext,
    answers: AdvisorAnswer[],
    options?: EvaluateAdvisorsOptions
  ): Promise<AdvisorResult>;
}

export interface CorporateTaxRunInput {
  companyId: number;
  fiscalYearEnd: Date;
}

export interface ValuationRunInput {
  companyId: number;
  valuationDate?: Date;
}

export interface TaxEngineContract extends EngineContractBase {
  runCorporateReturn(
    context: EngineContext,
    input: CorporateTaxRunInput
  ): Promise<CorporateTaxComputation>;
  runPersonalReturn(
    context: EngineContext,
    input: PersonalTaxInput
  ): Promise<PersonalTaxComputation>;
}

export interface ValuationEngineContract extends EngineContractBase {
  compute(
    context: EngineContext,
    input: ValuationRunInput
  ): Promise<ValuationComputation>;
  createSnapshot(
    context: EngineContext,
    input: ValuationRunInput & { notes?: string | null }
  ): Promise<ValuationSnapshotDto>;
  listSnapshots(
    context: EngineContext,
    filters?: { companyId?: number }
  ): Promise<ValuationSnapshotDto[]>;
  deleteSnapshot(
    context: EngineContext,
    snapshotId: number
  ): Promise<boolean>;
}

export interface WealthOverviewOptions {
  asOf?: Date;
  year?: number;
  persistSnapshot?: boolean;
}

export interface WealthEngineContract extends EngineContractBase {
  buildOverview(
    context: EngineContext,
    options?: WealthOverviewOptions
  ): Promise<FamilyWealthOverview>;
  buildHistory(context: EngineContext): Promise<FamilyWealthHistoryPoint[]>;
  runScenario(
    context: EngineContext,
    input: FamilyWealthScenarioInput,
    options?: { persist?: boolean }
  ): Promise<FamilyWealthScenarioResult>;
  runStressTest(
    context: EngineContext,
    input: StressTestInput
  ): Promise<StressTestResult>;
}

export interface LeveragedFinanceEngineContract extends EngineContractBase {
  normalize(input: LeveragedBuybackInput): LeveragedBuybackNormalizedInput;
  compute(
    context: EngineContext,
    input: LeveragedBuybackInput
  ): Promise<LeveragedBuybackComputation>;
  formatResolution(
    scenario: LeveragedBuybackScenarioDto,
    actorName: string
  ): string;
}

export interface SuccessionEngineContract extends EngineContractBase {
  runSimulation(
    context: EngineContext,
    input: FreezeSimulationInput
  ): Promise<FreezeSimulationSummary>;
  getProgress(context: EngineContext): Promise<SuccessionProgressReport>;
}

export interface ProfileEngineContract extends EngineContractBase {
  buildSummary(context: EngineContext): Promise<ProfileSummary>;
  deriveInsights(summary: ProfileSummary): ProfileInsight[];
  buildDashboard(context: EngineContext): Promise<ProfileDashboardPayload>;
}

export interface EngineRegistry {
  advisor: AdvisorEngineContract;
  tax: TaxEngineContract;
  valuation: ValuationEngineContract;
  wealth: WealthEngineContract;
  'leveraged-finance': LeveragedFinanceEngineContract;
  succession: SuccessionEngineContract;
  profile: ProfileEngineContract;
}
