import puppeteer from 'puppeteer';

import type { CorporateExportCompany, SummaryResponse } from './summaryService';
import { buildSummaryTable } from './summaryTable';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

function formatPercent(value: number | null) {
  if (typeof value !== 'number') {
    return '—';
  }

  return `${(value * 100).toFixed(2)} %`;
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleDateString('fr-CA');
}

function formatBoolean(value: boolean) {
  return value ? 'Oui' : 'Non';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPlainText(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '—';
  }

  return escapeHtml(trimmed);
}

function formatMultiline(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '—';
  }

  return escapeHtml(trimmed).replace(/\r?\n/g, '<br />');
}

function renderSummaryHtml(summary: SummaryResponse): string {
  const table = buildSummaryTable(summary);
  const corporateDetails = (summary as { corporateDetails?: CorporateExportCompany[] }).corporateDetails ?? [];
  const corporate = summary.corporate;

  const propertyRows = table.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td class="numeric">${row.unitsCount}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.rentPotentialMonthly))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.outstandingDebt))}</td>
          <td class="numeric">${escapeHtml(formatPercent(row.loanToValue))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.grossIncome))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.operatingExpenses))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.debtService))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.interestPortion))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.principalPortion))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.netCashflow))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.cca))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(row.equity))}</td>
        </tr>
      `
    )
    .join('');

  const totalRow = `
    <tr class="total">
      <td>${escapeHtml(table.totals.label)}</td>
      <td class="numeric">${table.totals.unitsCount}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.rentPotentialMonthly))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.outstandingDebt))}</td>
      <td class="numeric">${escapeHtml(formatPercent(table.totals.loanToValue))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.grossIncome))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.operatingExpenses))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.debtService))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.interestPortion))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.principalPortion))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.netCashflow))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.cca))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(table.totals.equity))}</td>
    </tr>
  `;

  const headerRow = table.headers
    .map((header, index) => {
      const className = index === 0 ? '' : ' class="numeric"';
      return `<th${className}>${escapeHtml(header)}</th>`;
    })
    .join('');

  const propertySection = `
    <section class="section">
      <h2>Performance immobilière</h2>
      <table class="data-table">
        <thead>
          <tr>
            ${headerRow}
          </tr>
        </thead>
        <tbody>
          ${propertyRows}
          ${totalRow}
        </tbody>
      </table>
    </section>
  `;

  const metricsData = [
    { label: 'Sociétés actives', value: corporate.companiesCount.toString() },
    { label: 'Actionnaires suivis', value: corporate.shareholdersCount.toString() },
    { label: "Classes d'actions", value: corporate.shareClassesCount.toString() },
    { label: "Transactions d'actions", value: corporate.shareTransactionsCount.toString() },
    { label: 'Valeur des transactions (FMV)', value: formatCurrency(corporate.shareTransactionsValue) },
    { label: 'Contrepartie reçue', value: formatCurrency(corporate.shareTransactionsConsideration) },
    { label: 'États financiers consignés', value: corporate.statementsCount.toString() },
    { label: 'Résolutions consignées', value: corporate.resolutionsCount.toString() },
    { label: 'Actifs consolidés', value: formatCurrency(corporate.totalAssets) },
    { label: 'Capitaux propres consolidés', value: formatCurrency(corporate.totalEquity) },
    { label: 'Bénéfice net consolidé', value: formatCurrency(corporate.totalNetIncome) },
    {
      label: 'Dernier état financier',
      value: corporate.latestStatement
        ? `${corporate.latestStatement.companyName} · ${formatIsoDate(corporate.latestStatement.periodEnd)} · ${corporate.latestStatement.statementType}`
        : 'Aucun'
    },
    {
      label: 'Dernière résolution',
      value: corporate.latestResolution
        ? `${corporate.latestResolution.companyName} · ${formatIsoDate(corporate.latestResolution.resolutionDate)} · ${corporate.latestResolution.type}`
        : 'Aucune'
    }
  ];

  const metricsRows = metricsData
    .map(
      (metric) => `
        <tr>
          <th>${escapeHtml(metric.label)}</th>
          <td class="numeric">${escapeHtml(metric.value)}</td>
        </tr>
      `
    )
    .join('');

  const statementSummaries = corporateDetails
    .flatMap((company) =>
      company.statements.map(
        (statement) => `
          <tr>
            <td>${escapeHtml(company.companyName)}</td>
            <td>${escapeHtml(statement.statementType)}</td>
            <td>${escapeHtml(formatIsoDate(statement.periodStart))}</td>
            <td>${escapeHtml(formatIsoDate(statement.periodEnd))}</td>
            <td>${escapeHtml(formatBoolean(statement.isAudited))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.assets))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.liabilities))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.equity))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.revenue))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.expenses))}</td>
            <td class="numeric">${escapeHtml(formatCurrency(statement.totals.netIncome))}</td>
            <td>${formatPlainText(statement.metadata)}</td>
          </tr>
        `
      )
    )
    .join('');

  const statementLines = corporateDetails
    .flatMap((company) =>
      company.statements.flatMap((statement) =>
        statement.lines.map(
          (line) => `
            <tr>
              <td>${escapeHtml(company.companyName)}</td>
              <td>${escapeHtml(statement.statementType)}</td>
              <td>${escapeHtml(formatIsoDate(statement.periodEnd))}</td>
              <td>${escapeHtml(line.category)}</td>
              <td>${escapeHtml(line.label)}</td>
              <td class="numeric">${escapeHtml(formatCurrency(line.amount))}</td>
              <td>${formatPlainText(line.metadata)}</td>
            </tr>
          `
        )
      )
    )
    .join('');

  const resolutionRows = corporateDetails
    .flatMap((company) =>
      company.resolutions.map(
        (resolution) => `
          <tr>
            <td>${escapeHtml(company.companyName)}</td>
            <td>${escapeHtml(resolution.type)}</td>
            <td>${escapeHtml(formatIsoDate(resolution.resolutionDate))}</td>
            <td>${escapeHtml(resolution.title)}</td>
            <td>${formatMultiline(resolution.body)}</td>
            <td>${formatPlainText(resolution.metadata)}</td>
          </tr>
        `
      )
    )
    .join('');

  const corporateSectionParts: string[] = [
    `
      <div class="subsection">
        <h3>Indicateurs clés</h3>
        <table class="metrics-table">
          <tbody>
            ${metricsRows}
          </tbody>
        </table>
      </div>
    `
  ];

  if (statementSummaries.length > 0) {
    corporateSectionParts.push(`
      <div class="subsection">
        <h3>États financiers (synthèse)</h3>
        <table class="detail-table">
          <thead>
            <tr>
              <th>Société</th>
              <th>Type</th>
              <th>Période début</th>
              <th>Période fin</th>
              <th>Audité</th>
              <th class="numeric">Actifs</th>
              <th class="numeric">Passifs</th>
              <th class="numeric">Capitaux propres</th>
              <th class="numeric">Revenus</th>
              <th class="numeric">Dépenses</th>
              <th class="numeric">Bénéfice net</th>
              <th>Métadonnées</th>
            </tr>
          </thead>
          <tbody>
            ${statementSummaries}
          </tbody>
        </table>
      </div>
    `);
  }

  if (statementLines.length > 0) {
    corporateSectionParts.push(`
      <div class="subsection">
        <h3>États financiers (détail des lignes)</h3>
        <table class="detail-table">
          <thead>
            <tr>
              <th>Société</th>
              <th>Type</th>
              <th>Période fin</th>
              <th>Catégorie</th>
              <th>Libellé</th>
              <th class="numeric">Montant</th>
              <th>Métadonnées</th>
            </tr>
          </thead>
          <tbody>
            ${statementLines}
          </tbody>
        </table>
      </div>
    `);
  }

  if (resolutionRows.length > 0) {
    corporateSectionParts.push(`
      <div class="subsection">
        <h3>Résolutions corporatives</h3>
        <table class="detail-table">
          <thead>
            <tr>
              <th>Société</th>
              <th>Type</th>
              <th>Date</th>
              <th>Titre</th>
              <th>Contenu</th>
              <th>Métadonnées</th>
            </tr>
          </thead>
          <tbody>
            ${resolutionRows}
          </tbody>
        </table>
      </div>
    `);
  }

  const corporateSection = `
    <section class="section">
      <h2>Activité corporative</h2>
      ${corporateSectionParts.join('')}
    </section>
  `;

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Bilan immobilier Nowis IA</title>
        <style>
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            margin: 32px;
            color: #1f2933;
          }
          h1 {
            margin-bottom: 8px;
          }
          h2 {
            margin-bottom: 12px;
          }
          h3 {
            margin-bottom: 8px;
          }
          .subtitle {
            margin-bottom: 24px;
            color: #52606d;
          }
          .section {
            margin-top: 32px;
          }
          .subsection {
            margin-top: 24px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 8px 12px;
            border-bottom: 1px solid #d9e2ec;
            text-align: left;
          }
          th {
            background-color: #f5f7fa;
          }
          .numeric {
            text-align: right;
          }
          tr.total {
            font-weight: 600;
            background-color: #e3f8ff;
          }
          table.metrics-table th {
            width: 55%;
          }
          table.metrics-table td {
            font-weight: 600;
          }
          table.detail-table tbody tr:nth-child(even) {
            background-color: #f9fbfd;
          }
        </style>
      </head>
      <body>
        <h1>Bilan immobilier consolidé</h1>
        <div class="subtitle">Généré le ${new Date().toLocaleString('fr-CA')}</div>
        ${propertySection}
        ${corporateSection}
      </body>
    </html>
  `;
}

export async function generateSummaryPdf(summary: SummaryResponse): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderSummaryHtml(summary), { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}
