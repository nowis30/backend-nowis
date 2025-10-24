import type { SummaryResponse } from './summaryService';

export interface SummaryTableRow {
  label: string;
  unitsCount: number;
  rentPotentialMonthly: number;
  outstandingDebt: number;
  loanToValue: number | null;
  grossIncome: number;
  operatingExpenses: number;
  debtService: number;
  interestPortion: number;
  principalPortion: number;
  netCashflow: number;
  cca: number;
  equity: number;
}

export interface SummaryTable {
  headers: readonly string[];
  rows: SummaryTableRow[];
  totals: SummaryTableRow;
}

export const SUMMARY_TABLE_HEADERS: readonly string[] = [
  'Immeuble',
  'Unités',
  'Loyer potentiel',
  'Dette en cours',
  'Ratio LTV (%)',
  'Revenus',
  'Dépenses',
  'Service de la dette',
  'Intérêts',
  'Capital',
  'Cashflow net',
  'CCA',
  'Équité'
];

function mapSummaryRow(label: string, row: {
  unitsCount: number;
  rentPotentialMonthly: number;
  outstandingDebt: number;
  loanToValue: number | null;
  grossIncome: number;
  operatingExpenses: number;
  debtService: number;
  interestPortion: number;
  principalPortion: number;
  netCashflow: number;
  cca: number;
  equity: number;
}): SummaryTableRow {
  return {
    label,
    unitsCount: row.unitsCount,
    rentPotentialMonthly: row.rentPotentialMonthly,
    outstandingDebt: row.outstandingDebt,
    loanToValue: row.loanToValue,
    grossIncome: row.grossIncome,
    operatingExpenses: row.operatingExpenses,
    debtService: row.debtService,
    interestPortion: row.interestPortion,
    principalPortion: row.principalPortion,
    netCashflow: row.netCashflow,
    cca: row.cca,
    equity: row.equity
  };
}

export function buildSummaryTable(summary: SummaryResponse): SummaryTable {
  const rows = summary.properties.map((property) =>
    mapSummaryRow(property.propertyName, property)
  );

  const totals = mapSummaryRow('TOTAL', summary.totals);

  return {
    headers: SUMMARY_TABLE_HEADERS,
    rows,
    totals
  };
}
