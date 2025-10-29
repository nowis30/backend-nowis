import { buildFamilyWealthHistory, buildFamilyWealthOverview, type FamilyWealthHistoryPoint, type FamilyWealthOverview } from './wealth/familyWealthService';
import { type ProfileSummary } from './profileSummaryService';
import { roundCurrency } from './utils/numbers';

export interface ProfileProjectionPoint {
  month: string;
  projectedNetWorth: number;
  projectedChange: number;
}

export interface ProfileProjectionAssumptions {
  baselineNetWorth: number;
  averageMonthlyChange: number;
  averageMonthlyGrowthRate: number;
  monthlyExpenses: number;
}

export interface ProfileProjection {
  timeline: ProfileProjectionPoint[];
  assumptions: ProfileProjectionAssumptions;
  notes: string[];
}

interface BuildProfileProjectionContext {
  summary: ProfileSummary;
  wealthHistory?: FamilyWealthHistoryPoint[];
  wealthOverview?: FamilyWealthOverview;
  referenceDate?: Date;
  personal?: {
    latestTaxYear: number | null;
    taxableIncome: number;
    federalTax: number;
    provincialTax: number;
  };
}

const DEFAULT_MONTHLY_GROWTH_RATE = 0.0025; // ~3% annualised

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function safeMonthlyDelta(prev: FamilyWealthHistoryPoint, next: FamilyWealthHistoryPoint): { change: number; rate: number } {
  const prevNetWorth = prev.netWorth;
  const nextNetWorth = next.netWorth;
  const prevDate = new Date(prev.snapshotDate);
  const nextDate = new Date(next.snapshotDate);
  const diffMs = Math.max(nextDate.getTime() - prevDate.getTime(), 0);
  const diffMonths = Math.max(diffMs / (1000 * 60 * 60 * 24 * 30), 1 / 30);
  const changePerMonth = (nextNetWorth - prevNetWorth) / diffMonths;
  const ratePerMonth = prevNetWorth > 0 ? (nextNetWorth - prevNetWorth) / prevNetWorth / diffMonths : 0;

  return {
    change: roundCurrency(changePerMonth),
    rate: ratePerMonth
  };
}

async function resolveBaselineNetWorth(
  userId: number,
  history: FamilyWealthHistoryPoint[],
  overview: FamilyWealthOverview | undefined
): Promise<number> {
  if (history.length > 0) {
    return history[history.length - 1].netWorth;
  }

  if (overview) {
    return overview.totals.netWorth;
  }

  const latestOverview = await buildFamilyWealthOverview(userId, { persistSnapshot: false });
  return latestOverview.totals.netWorth;
}

export async function buildProfileProjection(
  userId: number,
  context: BuildProfileProjectionContext
): Promise<ProfileProjection> {
  const history = context.wealthHistory ?? (await buildFamilyWealthHistory(userId));
  const overview = context.wealthOverview;
  const baselineNetWorth = roundCurrency(await resolveBaselineNetWorth(userId, history, overview));

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime()
  );

  const monthlyChanges: number[] = [];
  const monthlyRates: number[] = [];

  for (let index = 1; index < sortedHistory.length; index += 1) {
    const delta = safeMonthlyDelta(sortedHistory[index - 1], sortedHistory[index]);
    monthlyChanges.push(delta.change);
    monthlyRates.push(delta.rate);
  }

  let averageMonthlyChange = monthlyChanges.length
    ? roundCurrency(monthlyChanges.reduce((sum, value) => sum + value, 0) / monthlyChanges.length)
    : 0;

  let averageMonthlyGrowthRate = monthlyRates.length
    ? monthlyRates.reduce((sum, value) => sum + value, 0) / monthlyRates.length
    : DEFAULT_MONTHLY_GROWTH_RATE;

  // Ajustement avec les données personnelles issues du rapport d'impôt (si disponibles)
  if (context.personal) {
    const estMonthlyNetIncome = (context.personal.taxableIncome - (context.personal.federalTax + context.personal.provincialTax)) / 12;
    const estMonthlyNetSavings = roundCurrency(estMonthlyNetIncome - context.summary.totals.monthlyExpenses);

    // Si on n'a pas d'historique significatif, on initialise le flux mensuel par l'épargne nette estimée
    if (monthlyChanges.length === 0 || Math.abs(averageMonthlyChange) < 1) {
      averageMonthlyChange = estMonthlyNetSavings;
    } else {
      // Sinon, pondérer légèrement (80% historique, 20% impôt) pour stabiliser
      averageMonthlyChange = roundCurrency(0.8 * averageMonthlyChange + 0.2 * estMonthlyNetSavings);
    }

    // Si pas d'historique de taux, garder le défaut; sinon, ne pas forcer
    if (monthlyRates.length === 0) {
      averageMonthlyGrowthRate = averageMonthlyGrowthRate;
    }
  }

  const referenceDate = context.referenceDate
    ? new Date(context.referenceDate)
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const timeline: ProfileProjectionPoint[] = [];
  let previousNetWorth = baselineNetWorth;

  for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
    const projectionDate = addMonths(referenceDate, monthIndex);
    const projectedNetWorth = roundCurrency(
      previousNetWorth * (1 + averageMonthlyGrowthRate) + averageMonthlyChange
    );
    timeline.push({
      month: projectionDate.toISOString().slice(0, 10),
      projectedNetWorth,
      projectedChange: roundCurrency(projectedNetWorth - previousNetWorth)
    });
    previousNetWorth = projectedNetWorth;
  }

  const finalNetWorth = timeline.length > 0 ? timeline[timeline.length - 1].projectedNetWorth : baselineNetWorth;
  const notes: string[] = [];

  notes.push('Projection basée sur les snapshots patrimoniaux et les dépenses actuelles.');

  if (context.personal) {
    const yr = context.personal.latestTaxYear;
    const netMonthly = (context.personal.taxableIncome - (context.personal.federalTax + context.personal.provincialTax)) / 12;
    const netSavings = roundCurrency(netMonthly - context.summary.totals.monthlyExpenses);
    notes.push(
      `Ajustement selon impôt ${yr ?? ''} : revenu net mensuel estimé ${netMonthly.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}, ` +
      `épargne nette ${netSavings.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}.`
    );
  }

  if (monthlyChanges.length === 0) {
    notes.push("Historique insuffisant : une croissance mensuelle neutre (0,25 %) a été appliquée.");
  } else {
    notes.push(
      `Croissance mensuelle moyenne observée : ${(averageMonthlyGrowthRate * 100).toFixed(2)} %.`
    );
  }

  if (averageMonthlyChange < 0) {
    notes.push(
      `Flux de trésorerie net mensuel estimé à ${averageMonthlyChange.toLocaleString('fr-CA', {
        style: 'currency',
        currency: 'CAD'
      })} — surveiller les sorties de trésorerie.`
    );
  } else if (averageMonthlyChange > 0) {
    notes.push(
      `Flux de trésorerie net mensuel positif estimé à ${averageMonthlyChange.toLocaleString('fr-CA', {
        style: 'currency',
        currency: 'CAD'
      })}.`
    );
  }

  if (finalNetWorth < baselineNetWorth) {
    notes.push('La tendance projetée est négative sur 12 mois, envisager des ajustements budgétaires.');
  }

  const expenseRatio = baselineNetWorth > 0
    ? Math.min(context.summary.totals.monthlyExpenses / baselineNetWorth, 1)
    : 0;

  notes.push(
    `Les dépenses mensuelles actuelles représentent ${(expenseRatio * 100).toFixed(1)} % du patrimoine de départ.`
  );

  return {
    timeline,
    assumptions: {
      baselineNetWorth,
      averageMonthlyChange,
      averageMonthlyGrowthRate,
      monthlyExpenses: roundCurrency(context.summary.totals.monthlyExpenses)
    },
    notes
  };
}
