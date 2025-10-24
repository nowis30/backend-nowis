"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUMMARY_TABLE_HEADERS = void 0;
exports.buildSummaryTable = buildSummaryTable;
exports.SUMMARY_TABLE_HEADERS = [
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
function mapSummaryRow(label, row) {
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
function buildSummaryTable(summary) {
    const rows = summary.properties.map((property) => mapSummaryRow(property.propertyName, property));
    const totals = mapSummaryRow('TOTAL', summary.totals);
    return {
        headers: exports.SUMMARY_TABLE_HEADERS,
        rows,
        totals
    };
}
