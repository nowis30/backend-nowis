export type AdvisorExpertId = 'fiscaliste' | 'comptable' | 'planificateur' | 'avocat';

export interface AdvisorQuestionOption {
  value: string;
  label: string;
  helperText?: string;
}

export interface AdvisorQuestion {
  id: string;
  label: string;
  description?: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: AdvisorQuestionOption[];
}

export interface AdvisorAnswer {
  questionId: string;
  value: string;
}

export interface AdvisorContext {
  answers: AdvisorAnswer[];
  parsed: AdvisorFacts;
}

export type AdvisorEngineName = 'heuristic' | 'gpt';

export interface EvaluateAdvisorsOptions {
  engine?: AdvisorEngineName;
}

export interface AdvisorFacts {
  taxableIncome: number | null;
  profitMargin: number | null;
  province: string | null;
  hasHoldingCompany: boolean | null;
  dividendIntent: 'NONE' | 'LOW' | 'HIGH' | 'UNKNOWN';
  liquidityGoal: 'STABILITY' | 'GROWTH' | 'WITHDRAWAL' | 'UNKNOWN';
  legalConcern: 'NONE' | 'SUCCESSION' | 'LITIGATION' | 'UNKNOWN';
  assetProfile: 'NONE' | 'SALARIED_ONLY' | 'JOB_AND_PROPERTIES' | 'BUSINESS' | 'BUSINESS_AND_PROPERTIES' | 'UNKNOWN';
  uncertain: Record<string, boolean>;
}

export interface AdvisorMetric {
  id: string;
  label: string;
  value: string;
  explanation: string;
  expertIds: AdvisorExpertId[];
}

export interface AdvisorRecommendation {
  expertId: AdvisorExpertId;
  title: string;
  summary: string;
  rationale: string[];
}

export interface AdvisorModuleOutput {
  recommendation: AdvisorRecommendation;
  metrics: AdvisorMetric[];
  followUps: string[];
}

export interface AdvisorUncertaintyField {
  questionId: string;
  label: string;
  description?: string;
}

export interface AdvisorResult {
  nextQuestion: AdvisorQuestion | null;
  completed: boolean;
  coordinatorSummary: string;
  recommendations: AdvisorRecommendation[];
  metrics: AdvisorMetric[];
  followUps: string[];
  uncertainty: AdvisorUncertaintyField[];
  engine: {
    mode: AdvisorEngineName;
    isSimulated: boolean;
    note?: string;
  };
}
