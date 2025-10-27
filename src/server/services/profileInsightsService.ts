import { getProfileSummary, type ProfileSummary } from './profileSummaryService';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export interface ProfileInsight {
  code: string;
  severity: InsightSeverity;
  message: string;
  context?: Record<string, string | number>;
}

const MIN_PRIORITY_FOR_MONITORING = 2;
const MIN_GOAL_PROGRESS_PERCENT = 30;
const MIN_RUNWAY_MONTHS = 6;
const HIGH_DEBT_RATIO = 0.6;

export function deriveProfileInsights(summary: ProfileSummary): ProfileInsight[] {
  const insights: ProfileInsight[] = [];

  const investableAssets = summary.totals.personalAssets + summary.totals.investmentHoldings;
  const liabilities = summary.totals.personalLiabilities;
  const monthlyExpenses = summary.totals.monthlyExpenses;

  const debtRatio = investableAssets > 0 ? liabilities / investableAssets : 0;
  if (debtRatio > HIGH_DEBT_RATIO) {
    insights.push({
      code: 'HIGH_DEBT_RATIO',
      severity: 'warning',
      message: "La dette personnelle dépasse 60 % des actifs investissables. Planifie un désendettement prioritaire.",
      context: {
        debtRatio: Number(debtRatio.toFixed(2)),
        liabilities: Math.round(liabilities),
        investableAssets: Math.round(investableAssets)
      }
    });
  }

  if (monthlyExpenses > 0) {
    const runwayMonths = investableAssets > 0 ? investableAssets / monthlyExpenses : 0;
    if (runwayMonths < MIN_RUNWAY_MONTHS) {
      insights.push({
        code: 'SHORT_RUNWAY',
        severity: 'warning',
        message: "Les actifs disponibles couvrent moins de six mois de dépenses. Augmente le coussin de liquidités.",
        context: {
          runwayMonths: Number(runwayMonths.toFixed(1)),
          monthlyExpenses: Math.round(monthlyExpenses),
          investableAssets: Math.round(investableAssets)
        }
      });
    }
  }

  const laggingGoals = summary.goals.filter(
    (goal) => goal.priority <= MIN_PRIORITY_FOR_MONITORING && goal.progressPercent < MIN_GOAL_PROGRESS_PERCENT
  );

  if (laggingGoals.length > 0) {
    insights.push({
      code: 'GOALS_LAGGING',
      severity: 'info',
      message: "Certains objectifs prioritaires avancent lentement. Réalloue des contributions ou révise les cibles.",
      context: {
        goals: laggingGoals.map((goal) => goal.name).join(', '),
        averageProgress: Number(
          (
            laggingGoals.reduce((acc, goal) => acc + goal.progressPercent, 0) /
            laggingGoals.length
          ).toFixed(1)
        )
      }
    });
  }

  return insights;
}

export async function getProfileInsights(userId: number): Promise<ProfileInsight[]> {
  const summary = await getProfileSummary(userId);
  return deriveProfileInsights(summary);
}
