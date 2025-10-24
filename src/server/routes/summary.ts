import { Router, Response, NextFunction } from 'express';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { buildSummary, buildSummaryForExport } from '../services/summaryService';
import { generateSummaryPdf } from '../services/pdfService';
import { buildSummaryTable, SUMMARY_TABLE_HEADERS } from '../services/summaryTable';

const summaryRouter = Router();

summaryRouter.use(authenticated);

summaryRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await buildSummary(req.userId!);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

summaryRouter.get(
  '/export/csv',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const summary = await buildSummaryForExport(req.userId!);
      const table = buildSummaryTable(summary);

      const formatCurrency = (value: number) => value.toFixed(2);
      const formatPercent = (value: number | null) =>
        typeof value === 'number' ? (value * 100).toFixed(2) : '';
      const formatIsoDate = (value: string | null | undefined) =>
        value ? value.slice(0, 10) : '';
      const formatBoolean = (value: boolean) => (value ? 'Oui' : 'Non');
      const condense = (value: string | null | undefined) =>
        value ? value.replace(/\s+/g, ' ').trim() : '';

      const serialize = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const serializeRow = (row: string[]) => row.map(serialize).join(',');

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

      const metricsRows: string[][] = [
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

      const statementSummaryRows = summary.corporateDetails.flatMap((company) =>
        company.statements.map((statement) => [
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
        ])
      );

      const statementLineRows = summary.corporateDetails.flatMap((company) =>
        company.statements.flatMap((statement) =>
          statement.lines.map((line) => [
            company.companyName,
            statement.statementType,
            formatIsoDate(statement.periodEnd),
            line.category,
            line.label,
            formatCurrency(line.amount),
            condense(line.metadata)
          ])
        )
      );

      const resolutionRows = summary.corporateDetails.flatMap((company) =>
        company.resolutions.map((resolution) => [
          company.companyName,
          resolution.type,
          formatIsoDate(resolution.resolutionDate),
          resolution.title,
          condense(resolution.body),
          condense(resolution.metadata)
        ])
      );

      const csvLines: string[] = [];

      csvLines.push(serializeRow([...SUMMARY_TABLE_HEADERS]));
      propertyRows.forEach((row) => csvLines.push(serializeRow(row)));

      csvLines.push('');
      csvLines.push(serializeRow(['Synthèse corporate']));
      csvLines.push(serializeRow(['Indicateur', 'Valeur']));
      metricsRows.forEach((row) => csvLines.push(serializeRow(row)));

      if (statementSummaryRows.length > 0) {
        csvLines.push('');
        csvLines.push(serializeRow(['États financiers (synthèse)']));
        csvLines.push(
          serializeRow([
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
          ])
        );
        statementSummaryRows.forEach((row) => csvLines.push(serializeRow(row)));
      }

      if (statementLineRows.length > 0) {
        csvLines.push('');
        csvLines.push(serializeRow(['États financiers (détail des lignes)']));
        csvLines.push(
          serializeRow([
            'Société',
            'Type',
            'Période fin',
            'Catégorie',
            'Libellé',
            'Montant',
            'Métadonnées'
          ])
        );
        statementLineRows.forEach((row) => csvLines.push(serializeRow(row)));
      }

      if (resolutionRows.length > 0) {
        csvLines.push('');
        csvLines.push(serializeRow(['Résolutions corporatives']));
        csvLines.push(
          serializeRow([
            'Société',
            'Type',
            'Date',
            'Titre',
            'Contenu',
            'Métadonnées'
          ])
        );
        resolutionRows.forEach((row) => csvLines.push(serializeRow(row)));
      }

      const csvContent = csvLines.join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nowis-bilan.csv"');
      res.send(`\uFEFF${csvContent}`);
    } catch (error) {
      next(error);
    }
  }
);

summaryRouter.get(
  '/export/pdf',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const summary = await buildSummaryForExport(req.userId!);
      const pdfBuffer = await generateSummaryPdf(summary);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="nowis-bilan.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
);

export { summaryRouter };
