"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryRouter = void 0;
const express_1 = require("express");
const authenticated_1 = require("../middlewares/authenticated");
const summaryService_1 = require("../services/summaryService");
const pdfService_1 = require("../services/pdfService");
const summaryTable_1 = require("../services/summaryTable");
const summaryRouter = (0, express_1.Router)();
exports.summaryRouter = summaryRouter;
summaryRouter.use(authenticated_1.authenticated);
summaryRouter.get('/', async (req, res, next) => {
    try {
        const summary = await (0, summaryService_1.buildSummary)(req.userId);
        res.json(summary);
    }
    catch (error) {
        next(error);
    }
});
summaryRouter.get('/export/csv', async (req, res, next) => {
    try {
        const summary = await (0, summaryService_1.buildSummaryForExport)(req.userId);
        const table = (0, summaryTable_1.buildSummaryTable)(summary);
        const formatCurrency = (value) => value.toFixed(2);
        const formatPercent = (value) => typeof value === 'number' ? (value * 100).toFixed(2) : '';
        const formatIsoDate = (value) => value ? value.slice(0, 10) : '';
        const formatBoolean = (value) => (value ? 'Oui' : 'Non');
        const condense = (value) => value ? value.replace(/\s+/g, ' ').trim() : '';
        const serialize = (value) => `"${value.replace(/"/g, '""')}"`;
        const serializeRow = (row) => row.map(serialize).join(',');
        const propertyRows = [
            ...table.rows.map((row) => [
                row.label,
                row.unitsCount.toString(),
                formatCurrency(row.rentPotentialMonthly),
                formatCurrency(row.outstandingDebt),
                formatPercent(row.loanToValue),
                formatCurrency(row.grossIncome),
                formatCurrency(row.operatingExpenses),
                formatCurrency(row.debtService),
                formatCurrency(row.interestPortion),
                formatCurrency(row.principalPortion),
                formatCurrency(row.netCashflow),
                formatCurrency(row.cca),
                formatCurrency(row.equity)
            ]),
            [
                table.totals.label,
                table.totals.unitsCount.toString(),
                formatCurrency(table.totals.rentPotentialMonthly),
                formatCurrency(table.totals.outstandingDebt),
                formatPercent(table.totals.loanToValue),
                formatCurrency(table.totals.grossIncome),
                formatCurrency(table.totals.operatingExpenses),
                formatCurrency(table.totals.debtService),
                formatCurrency(table.totals.interestPortion),
                formatCurrency(table.totals.principalPortion),
                formatCurrency(table.totals.netCashflow),
                formatCurrency(table.totals.cca),
                formatCurrency(table.totals.equity)
            ]
        ];
        const corporate = summary.corporate;
        const metricsRows = [
            ['Sociétés actives', corporate.companiesCount.toString()],
            ['Actionnaires suivis', corporate.shareholdersCount.toString()],
            ['Classes d\'actions', corporate.shareClassesCount.toString()],
            ['Transactions d\'actions', corporate.shareTransactionsCount.toString()],
            ['Valeur des transactions (FMV)', formatCurrency(corporate.shareTransactionsValue)],
            ['Contrepartie reçue', formatCurrency(corporate.shareTransactionsConsideration)],
            ['États financiers', corporate.statementsCount.toString()],
            ['Résolutions consignées', corporate.resolutionsCount.toString()],
            ['Actifs consolidés', formatCurrency(corporate.totalAssets)],
            ['Capitaux propres consolidés', formatCurrency(corporate.totalEquity)],
            ['Bénéfice net consolidé', formatCurrency(corporate.totalNetIncome)],
            [
                'Dernier état financier',
                corporate.latestStatement
                    ? `${corporate.latestStatement.companyName} · ${formatIsoDate(corporate.latestStatement.periodEnd)} · ${corporate.latestStatement.statementType}`
                    : 'Aucun'
            ],
            [
                'Dernière résolution',
                corporate.latestResolution
                    ? `${corporate.latestResolution.companyName} · ${formatIsoDate(corporate.latestResolution.resolutionDate)} · ${corporate.latestResolution.type}`
                    : 'Aucune'
            ]
        ];
        const statementSummaryRows = summary.corporateDetails.flatMap((company) => company.statements.map((statement) => [
            company.companyName,
            statement.statementType,
            formatIsoDate(statement.periodStart),
            formatIsoDate(statement.periodEnd),
            formatBoolean(statement.isAudited),
            formatCurrency(statement.totals.assets),
            formatCurrency(statement.totals.liabilities),
            formatCurrency(statement.totals.equity),
            formatCurrency(statement.totals.revenue),
            formatCurrency(statement.totals.expenses),
            formatCurrency(statement.totals.netIncome),
            condense(statement.metadata)
        ]));
        const statementLineRows = summary.corporateDetails.flatMap((company) => company.statements.flatMap((statement) => statement.lines.map((line) => [
            company.companyName,
            statement.statementType,
            formatIsoDate(statement.periodEnd),
            line.category,
            line.label,
            formatCurrency(line.amount),
            condense(line.metadata)
        ])));
        const resolutionRows = summary.corporateDetails.flatMap((company) => company.resolutions.map((resolution) => [
            company.companyName,
            resolution.type,
            formatIsoDate(resolution.resolutionDate),
            resolution.title,
            condense(resolution.body),
            condense(resolution.metadata)
        ]));
        const csvLines = [];
        csvLines.push(serializeRow([...summaryTable_1.SUMMARY_TABLE_HEADERS]));
        propertyRows.forEach((row) => csvLines.push(serializeRow(row)));
        csvLines.push('');
        csvLines.push(serializeRow(['Synthèse corporate']));
        csvLines.push(serializeRow(['Indicateur', 'Valeur']));
        metricsRows.forEach((row) => csvLines.push(serializeRow(row)));
        if (statementSummaryRows.length > 0) {
            csvLines.push('');
            csvLines.push(serializeRow(['États financiers (synthèse)']));
            csvLines.push(serializeRow([
                'Société',
                'Type',
                'Période début',
                'Période fin',
                'Audité',
                'Actifs',
                'Passifs',
                'Capitaux propres',
                'Revenus',
                'Dépenses',
                'Bénéfice net',
                'Métadonnées'
            ]));
            statementSummaryRows.forEach((row) => csvLines.push(serializeRow(row)));
        }
        if (statementLineRows.length > 0) {
            csvLines.push('');
            csvLines.push(serializeRow(['États financiers (détail des lignes)']));
            csvLines.push(serializeRow([
                'Société',
                'Type',
                'Période fin',
                'Catégorie',
                'Libellé',
                'Montant',
                'Métadonnées'
            ]));
            statementLineRows.forEach((row) => csvLines.push(serializeRow(row)));
        }
        if (resolutionRows.length > 0) {
            csvLines.push('');
            csvLines.push(serializeRow(['Résolutions corporatives']));
            csvLines.push(serializeRow([
                'Société',
                'Type',
                'Date',
                'Titre',
                'Contenu',
                'Métadonnées'
            ]));
            resolutionRows.forEach((row) => csvLines.push(serializeRow(row)));
        }
        const csvContent = csvLines.join('\r\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="nowis-bilan.csv"');
        res.send(`\uFEFF${csvContent}`);
    }
    catch (error) {
        next(error);
    }
});
summaryRouter.get('/export/pdf', async (req, res, next) => {
    try {
        const summary = await (0, summaryService_1.buildSummaryForExport)(req.userId);
        const pdfBuffer = await (0, pdfService_1.generateSummaryPdf)(summary);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="nowis-bilan.pdf"');
        res.send(pdfBuffer);
    }
    catch (error) {
        next(error);
    }
});
