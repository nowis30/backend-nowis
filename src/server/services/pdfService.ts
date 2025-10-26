import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

import type { LeveragedBuybackScenarioDto } from './leveragedBuybackService';
import type { RentalTaxComputedData, RentalTaxFormPayload } from './rentalTaxService';
import type { CorporateExportCompany, SummaryResponse } from './summaryService';
import type { AnnualReportData } from './tax/annualReportService';
import type { ValuationSnapshotDto } from './valuationEngineService';
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

interface LeveragedBuybackPdfPayload {
  scenario: LeveragedBuybackScenarioDto;
  notes: string | null;
}

type RentalTaxFormTypeLiteral = 'T776' | 'TP128';

interface RentalTaxPdfPayload {
  formType: RentalTaxFormTypeLiteral;
  taxYear: number;
  propertyName: string | null;
  propertyAddress: string | null;
  payload: RentalTaxFormPayload;
  computed: RentalTaxComputedData;
  notes: string | null;
  generatedAt: string;
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

function renderAnnualReportHtml(report: AnnualReportData): string {
  const table = buildSummaryTable(report.summary);
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

  const corporate = report.summary.corporate;
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
    { label: 'Bénéfice net consolidé', value: formatCurrency(corporate.totalNetIncome) }
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

  const corporateTaxRows = report.corporateTaxes
    .map(
      (tax) => `
        <tr>
          <td>${escapeHtml(tax.companyName)}</td>
          <td>${escapeHtml(formatIsoDate(tax.fiscalYearEnd))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.taxableIncome))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.federalTax))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.provincialTax))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.smallBusinessDeduction))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.rdtohClosing))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.gripClosing))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.cdaClosing))}</td>
        </tr>
      `
    )
    .join('');

  const corporateTaxSection = corporateTaxRows
    ? `
    <section class="section">
      <h2>Impôt corporatif</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Société</th>
            <th>Fin d'exercice</th>
            <th class="numeric">Revenu imposable</th>
            <th class="numeric">Impôt fédéral</th>
            <th class="numeric">Impôt provincial</th>
            <th class="numeric">Déduction PME</th>
            <th class="numeric">RDTOH fin</th>
            <th class="numeric">GRIP fin</th>
            <th class="numeric">CDA fin</th>
          </tr>
        </thead>
        <tbody>
          ${corporateTaxRows}
        </tbody>
      </table>
    </section>
  `
    : '';

  const personalTaxRows = report.personalTaxes
    .map(
      (tax) => `
        <tr>
          <td>${escapeHtml(tax.shareholderName)}</td>
          <td class="numeric">${tax.taxYear}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.taxableIncome))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.federalTax))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.provincialTax))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(tax.balanceDue))}</td>
        </tr>
      `
    )
    .join('');

  const personalTaxSection = personalTaxRows
    ? `
    <section class="section">
      <h2>Impôt personnel (Québec / Canada)</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Contribuable</th>
            <th class="numeric">Année</th>
            <th class="numeric">Revenu imposable</th>
            <th class="numeric">Impôt fédéral</th>
            <th class="numeric">Impôt provincial</th>
            <th class="numeric">Solde dû</th>
          </tr>
        </thead>
        <tbody>
          ${personalTaxRows}
        </tbody>
      </table>
    </section>
  `
    : '';

  const dividendRows = report.dividends
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatIsoDate(item.declarationDate))}</td>
          <td>${escapeHtml(formatIsoDate(item.paymentDate))}</td>
          <td>${escapeHtml(item.companyName)}</td>
          <td>${escapeHtml(item.shareholderName)}</td>
          <td>${escapeHtml(item.shareClassCode ?? '—')}</td>
          <td>${escapeHtml(item.dividendType === 'ELIGIBLE' ? 'Admissible' : 'Non admissible')}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.amount))}</td>
          <td class="numeric">${escapeHtml(formatPercent(item.grossUpRate))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.grossedAmount))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.federalCredit))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.provincialCredit))}</td>
          <td>${formatPlainText(item.notes)}</td>
        </tr>
      `
    )
    .join('');

  const dividendsSection = dividendRows
    ? `
    <section class="section">
      <h2>Dividendes déclarés</h2>
      <table class="detail-table">
        <thead>
          <tr>
            <th>Déclaration</th>
            <th>Paiement</th>
            <th>Société</th>
            <th>Bénéficiaire</th>
            <th>Classe</th>
            <th>Type</th>
            <th class="numeric">Montant</th>
            <th class="numeric">Taux majoration</th>
            <th class="numeric">Montant majoré</th>
            <th class="numeric">Crédit fédéral</th>
            <th class="numeric">Crédit Québec</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${dividendRows}
        </tbody>
      </table>
    </section>
  `
    : '';

  const rocRows = report.returnsOfCapital
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatIsoDate(item.transactionDate))}</td>
          <td>${escapeHtml(item.companyName)}</td>
          <td>${escapeHtml(item.shareholderName)}</td>
          <td>${escapeHtml(item.shareClassCode ?? '—')}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.amount))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.previousAcb ?? 0))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.newAcb ?? 0))}</td>
          <td>${formatPlainText(item.notes)}</td>
        </tr>
      `
    )
    .join('');

  const rocSection = rocRows
    ? `
    <section class="section">
      <h2>Retours de capital</h2>
      <table class="detail-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Société</th>
            <th>Bénéficiaire</th>
            <th>Classe</th>
            <th class="numeric">Montant</th>
            <th class="numeric">PBR avant</th>
            <th class="numeric">PBR après</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rocRows}
        </tbody>
      </table>
    </section>
  `
    : '';

  const loanSections = report.loans
    .map((loan) => {
      const scheduleRows = loan.schedule
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(formatIsoDate(entry.periodStart))}</td>
              <td>${escapeHtml(formatIsoDate(entry.periodEnd))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.openingBalance))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.interestAccrued))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.interestPaid))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.principalPaid))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.closingBalance))}</td>
            </tr>
          `
        )
        .join('');

      const meta = [
        `Émis le ${formatIsoDate(loan.issuedDate)}`,
        `Taux ${formatPercent(loan.interestRate)}`,
        `Méthode ${escapeHtml(loan.interestMethod)}`
      ];

      if (loan.dueDate) {
        meta.push(`Échéance ${formatIsoDate(loan.dueDate)}`);
      }

      return `
        <div class="subsection">
          <h3>${escapeHtml(loan.companyName)} → ${escapeHtml(loan.shareholderName)}</h3>
          <p class="meta">${meta.join(' · ')}</p>
          <table class="detail-table">
            <thead>
              <tr>
                <th>Période début</th>
                <th>Période fin</th>
                <th class="numeric">Solde ouverture</th>
                <th class="numeric">Intérêt couru</th>
                <th class="numeric">Intérêt payé</th>
                <th class="numeric">Capital payé</th>
                <th class="numeric">Solde fin</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleRows}
            </tbody>
          </table>
        </div>
      `;
    })
    .join('');

  const loansSection = loanSections
    ? `
    <section class="section">
      <h2>Billets d'actionnaires</h2>
      ${loanSections}
    </section>
  `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <title>Rapport annuel Nowis IA</title>
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
            margin-bottom: 6px;
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
          .meta {
            margin-bottom: 12px;
            color: #52606d;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 8px 10px;
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
        <h1>Rapport annuel ${report.year}</h1>
        <div class="subtitle">Généré le ${new Date(report.generatedAt).toLocaleString('fr-CA')}</div>
        <section class="section">
          <h2>Résumé opérationnel</h2>
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
          <div class="subsection">
            <h3>Métriques corporatives</h3>
            <table class="metrics-table">
              <tbody>
                ${metricsRows}
              </tbody>
            </table>
          </div>
        </section>
        ${corporateTaxSection}
        ${personalTaxSection}
        ${dividendsSection}
        ${rocSection}
        ${loansSection}
      </body>
    </html>
  `;
}

function renderLeveragedBuybackHtml({ scenario, notes }: LeveragedBuybackPdfPayload): string {
  const { inputs, metrics } = scenario;
  const noteText = notes ?? scenario.notes ?? null;
  const percentFormatter = new Intl.NumberFormat('fr-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const paybackFormatter = new Intl.NumberFormat('fr-CA', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  const generatedAt = new Date(scenario.generatedAt).toLocaleString('fr-CA');

  const outcomeClass = metrics.netGain > 0 ? 'positive' : metrics.netGain === 0 ? 'neutral' : 'negative';
  const outcomeLabel = metrics.netGain > 0 ? 'Favorable' : metrics.netGain === 0 ? 'Équilibre' : 'À surveiller';
  const outcomeDescription =
    metrics.netGain > 0
      ? 'Le gain net projeté est positif : le refinancement crée de la valeur après impôt.'
      : metrics.netGain === 0
        ? 'Le scénario atteint exactement son point mort : aucune perte ni gain projeté.'
        : 'Le coût net dépasse le gain projeté : une validation supplémentaire est recommandée.';

  const paybackText = typeof metrics.paybackYears === 'number' ? `${paybackFormatter.format(metrics.paybackYears)} ans` : '—';

  const formatPercentValue = (value: number) => `${percentFormatter.format(value)} %`;

  const subtitleParts = [
    scenario.companyName ? `Compagnie : ${scenario.companyName}` : null,
    `Généré le ${generatedAt}`,
    scenario.approved ? 'Statut : validé pour intégration' : 'Statut : analyse exploratoire'
  ].filter((value): value is string => Boolean(value));

  const inputRows = [
    ['Montant refinancé', formatCurrency(inputs.loanAmount)],
    ['Taux hypothécaire', formatPercentValue(inputs.interestRatePercent)],
    ['Durée analysée', `${percentFormatter.format(inputs.termYears)} années`],
    ['Taux marginal d’imposition', formatPercentValue(inputs.taxRatePercent)],
    ['Croissance attendue des actions', formatPercentValue(inputs.expectedGrowthPercent)],
    ['Point mort (taux de croissance)', formatPercent(metrics.breakEvenGrowth)]
  ];

  const observations: string[] = [
    `Gain net projeté de ${formatCurrency(metrics.netGain)} (${formatPercent(metrics.returnOnInvestment)} de retour sur le capital mobilisé).`,
    `Économie fiscale cumulée de ${formatCurrency(metrics.taxShield)} grâce à la déductibilité des intérêts.`,
    `La croissance minimale requise pour atteindre l’équilibre est de ${formatPercent(metrics.breakEvenGrowth)}.`
  ];

  if (typeof metrics.paybackYears === 'number') {
    observations.push(`À ce rythme, le coût net serait couvert après environ ${paybackText}.`);
  }

  const observationsHtml = observations
    .map(
      (item, index) => `
        <li>
          <span class="badge">${index + 1}</span>
          <div>${escapeHtml(item)}</div>
        </li>
      `
    )
    .join('');

  const metricsGrid = `
    <div class="metrics-grid">
      <div class="metric-card">
        <span class="label">Paiement hypothécaire</span>
        <span class="value">${formatCurrency(metrics.monthlyPayment)}</span>
        <div class="helper">Versement mensuel sur ${percentFormatter.format(inputs.termYears)} ans</div>
      </div>
      <div class="metric-card">
        <span class="label">Coût net après impôt</span>
        <span class="value">${formatCurrency(metrics.afterTaxInterest)}</span>
        <div class="helper">Intérêts payés de ${formatCurrency(metrics.totalInterest)} avec économie fiscale de ${formatCurrency(metrics.taxShield)}</div>
      </div>
      <div class="metric-card">
        <span class="label">Valeur projetée des actions</span>
        <span class="value">${formatCurrency(metrics.projectedShareValue)}</span>
        <div class="helper">Gain brut anticipé de ${formatCurrency(metrics.projectedShareGain)}</div>
      </div>
      <div class="metric-card">
        <span class="label">Gain net global</span>
        <span class="value">${formatCurrency(metrics.netGain)}</span>
        <div class="helper">Retour total de ${formatPercentValue(metrics.returnOnInvestmentPercent)}</div>
      </div>
    </div>
  `;

  const tableRows = inputRows
    .map(
      ([label, value]) => `
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join('');

  const notesSection = noteText
    ? `
      <section class="section">
        <h2>Notes & hypothèses</h2>
        <div class="notes">${formatMultiline(noteText)}</div>
      </section>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Simulation de rachat d'actions</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 36px;
            background: #f5f7fb;
            color: #1f2937;
          }
          h1 {
            font-size: 28px;
            margin: 0 0 4px;
            color: #111827;
          }
          .subtitle {
            font-size: 13px;
            color: #5f6b7a;
            display: flex;
            flex-wrap: wrap;
            gap: 12px 24px;
            margin-bottom: 18px;
          }
          .outcome {
            display: inline-flex;
            align-items: center;
            padding: 6px 16px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 24px;
          }
          .outcome.positive { background: #e8f5e9; color: #1b5e20; }
          .outcome.neutral { background: #fff3e0; color: #ef6c00; }
          .outcome.negative { background: #ffebee; color: #b71c1c; }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: #ffffff;
            border-radius: 18px;
            padding: 18px;
            box-shadow: 0 10px 24px rgba(15, 30, 67, 0.08);
          }
          .metric-card .label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7a89;
            display: block;
            margin-bottom: 6px;
          }
          .metric-card .value {
            font-size: 22px;
            font-weight: 600;
            color: #1f2937;
          }
          .metric-card .helper {
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
          }
          .section {
            background: #ffffff;
            border-radius: 18px;
            padding: 24px;
            box-shadow: 0 10px 24px rgba(15, 30, 67, 0.06);
            margin-bottom: 24px;
          }
          .section h2 {
            margin: 0 0 14px;
            font-size: 18px;
            color: #1f2937;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          .data-table th {
            text-align: left;
            padding: 8px 0;
            color: #5f6b7a;
            font-weight: 600;
            border-bottom: 1px solid #e7ecf5;
            width: 55%;
          }
          .data-table td {
            padding: 8px 0;
            border-bottom: 1px solid #eef2f8;
            color: #1f2937;
          }
          .observations {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .observations li {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 12px;
            font-size: 13px;
            color: #374151;
          }
          .observations li .badge {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: #1a73e8;
            color: #ffffff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
          }
          .notes {
            background: #fef3c7;
            border-radius: 12px;
            padding: 16px;
            color: #7c5109;
            font-size: 13px;
            line-height: 1.5;
          }
          .footnote {
            font-size: 11px;
            color: #6b7280;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(scenario.label ? `Simulation – ${scenario.label}` : "Simulation de rachat d'actions")}</h1>
  <div class="subtitle">${subtitleParts.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
        <div class="outcome ${outcomeClass}">${escapeHtml(outcomeLabel)}</div>
        <p style="font-size:13px; color:#4b5563; margin-top:-12px; margin-bottom:24px;">${escapeHtml(outcomeDescription)}</p>
        ${metricsGrid}
        <section class="section">
          <h2>Hypothèses financières</h2>
          <table class="data-table">
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Points de vigilance</h2>
          <ul class="observations">
            ${observationsHtml}
          </ul>
          <div class="footnote">Point mort obtenu à ${formatPercent(metrics.breakEvenGrowth)}. Retour sur investissement projeté : ${formatPercent(metrics.returnOnInvestment)}. Temps de remboursement estimé : ${escapeHtml(paybackText)}.</div>
        </section>
        ${notesSection}
        <div class="footnote">
          Hypothèses basées sur des projections constantes de taux et de croissance. Les résultats ne constituent pas un avis fiscal définitif et doivent être validés avec un professionnel.
        </div>
      </body>
    </html>
  `;
}

function renderRentalTaxStatementHtml({
  formType,
  taxYear,
  propertyName,
  propertyAddress,
  payload,
  computed,
  notes,
  generatedAt
}: RentalTaxPdfPayload): string {
  const formTitle = formType === 'T776' ? 'T776 – État des loyers' : 'TP-128 – Revenus de location';
  const scopeLabel = propertyName ? `${propertyName}${propertyAddress ? ` · ${propertyAddress}` : ''}` : 'Portefeuille complet';
  const headerSubtitle = `${formTitle} · Année ${taxYear}`;

  const incomeRows = [
    ['Revenus bruts de location', formatCurrency(payload.income.grossRents)],
    ['Autres revenus', formatCurrency(payload.income.otherIncome)],
    ['Total des revenus', formatCurrency(payload.income.totalIncome)]
  ]
    .map(
      ([label, value]) => `
        <tr>
          <th>${escapeHtml(label)}</th>
          <td>${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join('');

  const expenseRows = payload.expenses
    .map(
      (expense) => `
        <tr>
          <td>${escapeHtml(expense.label)}</td>
          <td>${formatCurrency(expense.amount)}</td>
        </tr>
      `
    )
    .join('');

  const comparisonRows = [
    {
      label: 'Total des revenus',
      declared: payload.income.totalIncome,
      computedValue: computed.totalIncome
    },
    {
      label: 'Total des dépenses',
      declared: payload.totals.totalExpenses,
      computedValue: computed.totalExpenses
    },
    {
      label: 'Revenu net',
      declared: payload.totals.netIncome,
      computedValue: computed.netIncome
    }
  ]
    .map((item) => {
      const delta = item.declared - item.computedValue;
      const trend = delta === 0 ? 'neutral' : delta > 0 ? 'warning' : 'positive';
      const deltaLabel =
        delta === 0
          ? 'Ajustement nul'
          : `${delta > 0 ? '+' : ''}${formatCurrency(delta)}`;

      return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${formatCurrency(item.declared)}</td>
          <td>${formatCurrency(item.computedValue)}</td>
          <td class="delta ${trend}">${deltaLabel}</td>
        </tr>
      `;
    })
    .join('');

  const notesSection = notes
    ? `
      <section class="section">
        <h2>Notes internes</h2>
        <div class="notes">${formatMultiline(notes)}</div>
      </section>
    `
    : '';

  const incomeDetailRows = computed.incomeDetails
    .map(
      (detail) => `
        <tr>
          <td>${escapeHtml(detail.label)}</td>
          <td>${formatCurrency(detail.amount)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(formTitle)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 36px;
            background: #f7f9fc;
            color: #1f2937;
          }
          h1 {
            font-size: 26px;
            margin: 0 0 8px;
            color: #111827;
          }
          .subtitle {
            font-size: 13px;
            color: #64748b;
            margin-bottom: 18px;
          }
          .badge {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 999px;
            background: #e0ecff;
            color: #1d4ed8;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 24px;
          }
          .section {
            background: #ffffff;
            border-radius: 16px;
            padding: 22px;
            box-shadow: 0 12px 28px rgba(15, 30, 67, 0.08);
            margin-bottom: 24px;
          }
          .section h2 {
            margin: 0 0 16px;
            font-size: 18px;
            color: #1f2937;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            padding: 8px 0;
            border-bottom: 1px solid #e5eaf2;
          }
          th {
            text-align: left;
            font-weight: 600;
            color: #475569;
          }
          td {
            text-align: right;
            color: #111827;
          }
          td:first-child, th:first-child {
            text-align: left;
          }
          .summary-table td {
            font-family: monospace;
          }
          .delta.neutral { color: #64748b; }
          .delta.positive { color: #15803d; }
          .delta.warning { color: #b45309; }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: linear-gradient(135deg, #1d4ed8, #3b82f6);
            color: #ffffff;
            border-radius: 18px;
            padding: 18px;
            box-shadow: 0 14px 30px rgba(29, 78, 216, 0.25);
          }
          .metric-card .label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            opacity: 0.8;
            display: block;
            margin-bottom: 6px;
          }
          .metric-card .value {
            font-size: 22px;
            font-weight: 600;
          }
          .notes {
            background: #fef3c7;
            border-radius: 12px;
            padding: 16px;
            color: #92400e;
            font-size: 13px;
            line-height: 1.5;
          }
          .footnote {
            font-size: 11px;
            color: #6b7280;
            margin-top: 16px;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(headerSubtitle)}</h1>
        <div class="subtitle">${escapeHtml(scopeLabel)} · Généré le ${escapeHtml(generatedAt)}</div>
        <span class="badge">Synthèse fiscale</span>

        <div class="grid">
          <div class="metric-card">
            <span class="label">Revenus nets projetés</span>
            <span class="value">${formatCurrency(payload.totals.netIncome)}</span>
          </div>
          <div class="metric-card">
            <span class="label">Charges enregistrées</span>
            <span class="value">${formatCurrency(payload.totals.totalExpenses)}</span>
          </div>
          <div class="metric-card">
            <span class="label">Intérêts hypothécaires</span>
            <span class="value">${formatCurrency(computed.mortgageInterest)}</span>
          </div>
          <div class="metric-card">
            <span class="label">CCA estimée</span>
            <span class="value">${formatCurrency(computed.capitalCostAllowance)}</span>
          </div>
        </div>

        <section class="section">
          <h2>Revenus de location</h2>
          <table>
            <tbody>
              ${incomeRows}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>Dépenses admissibles</h2>
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows}
            </tbody>
            <tfoot>
              <tr>
                <th>Total des dépenses</th>
                <th>${formatCurrency(payload.totals.totalExpenses)}</th>
              </tr>
            </tfoot>
          </table>
        </section>

        <section class="section">
          <h2>Comparaison avec le calcul automatique</h2>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Indicateur</th>
                <th>Déclaré</th>
                <th>Calcul automatique</th>
                <th>Ajustement</th>
              </tr>
            </thead>
            <tbody>
              ${comparisonRows}
            </tbody>
          </table>
        </section>

        <section class="section">
          <h2>Détails des revenus saisis</h2>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              ${incomeDetailRows || '<tr><td colspan="2">Aucun détail disponible.</td></tr>'}
            </tbody>
          </table>
        </section>

        ${notesSection}

        <div class="footnote">
          Les montants sont fournis à titre indicatif en vue de la préparation du formulaire ${escapeHtml(formType)}. Validez toute divergence importante avant transmission officielle.
        </div>
      </body>
    </html>
  `;
}

function renderValuationReportHtml(snapshot: ValuationSnapshotDto): string {
  const companyLabel = snapshot.companyName ?? 'Portefeuille familial';
  const generatedAt = new Date().toLocaleString('fr-CA');
  const valuationDateLabel = new Date(snapshot.valuationDate).toLocaleDateString('fr-CA');
  const numberFormatter = new Intl.NumberFormat('fr-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const percentFormatter = new Intl.NumberFormat('fr-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const summaryCards = [
    { label: 'Valeur nette', value: formatCurrency(snapshot.totals.netAssetValue) },
    { label: 'Valeur marchande cumulée', value: formatCurrency(snapshot.totals.totalMarketValue) },
    { label: 'Dettes en cours', value: formatCurrency(snapshot.totals.totalDebt) }
  ]
    .map(
      (card) => `
        <div class="metric-card">
          <span class="label">${escapeHtml(card.label)}</span>
          <span class="value">${escapeHtml(card.value)}</span>
        </div>
      `
    )
    .join('');

  const propertyRows = snapshot.properties
    .map((property) => {
      const addressLine = property.address
        ? `<div class="secondary">${escapeHtml(property.address)}</div>`
        : '';

      return `
        <tr>
          <td>
            <div class="primary">${escapeHtml(property.name)}</div>
            ${addressLine}
          </td>
          <td class="numeric">${escapeHtml(formatCurrency(property.marketValue))}</td>
          <td class="numeric">${escapeHtml(formatCurrency(property.debtOutstanding))}</td>
          <td class="numeric highlight">${escapeHtml(formatCurrency(property.netValue))}</td>
        </tr>
      `;
    })
    .join('');

  const propertyTotalsRow = `
    <tr class="total">
      <td>Total consolidé</td>
      <td class="numeric">${escapeHtml(formatCurrency(snapshot.totals.totalMarketValue))}</td>
      <td class="numeric">${escapeHtml(formatCurrency(snapshot.totals.totalDebt))}</td>
      <td class="numeric highlight">${escapeHtml(formatCurrency(snapshot.totals.netAssetValue))}</td>
    </tr>
  `;

  const propertyTableBody = snapshot.properties.length
    ? `${propertyRows}${propertyTotalsRow}`
    : '<tr><td colspan="4" class="empty">Aucun immeuble rattaché à cette entreprise.</td></tr>';

  const shareClassRows = snapshot.shareClasses.length
    ? snapshot.shareClasses
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(entry.code)}</td>
              <td class="numeric">${escapeHtml(numberFormatter.format(entry.totalShares))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.pricePerShare))}</td>
              <td class="numeric">${escapeHtml(formatCurrency(entry.totalValue))}</td>
              <td>${escapeHtml(entry.participatesInGrowth ? 'Oui' : 'Non')}</td>
            </tr>
          `
        )
        .join('')
    : `<tr><td colspan="5" class="empty">Aucune classe d'actions consignée à cette date.</td></tr>`;

  const shareholderRows = snapshot.shareholders.length
    ? snapshot.shareholders
        .map((shareholder) => {
          const breakdownItems = shareholder.breakdown.length
            ? shareholder.breakdown
                .map((detail) => {
                  const participationLabel = detail.participatesInGrowth ? '' : ' · non participatif';
                  return `
                    <li>
                      <strong>${escapeHtml(detail.shareClassCode)}</strong>
                      <span>${escapeHtml(numberFormatter.format(detail.shares))} actions</span>
                      <span>${escapeHtml(formatCurrency(detail.equityValue))}${escapeHtml(participationLabel)}</span>
                    </li>
                  `;
                })
                .join('')
            : '<li>Aucun détail disponible.</li>';

          return `
            <tr>
              <td><div class="primary">${escapeHtml(shareholder.displayName)}</div></td>
              <td class="numeric">${escapeHtml(numberFormatter.format(shareholder.totalShares))}</td>
              <td class="numeric">${escapeHtml(percentFormatter.format(shareholder.ownershipPercent))} %</td>
              <td class="numeric highlight">${escapeHtml(formatCurrency(shareholder.equityValue))}</td>
              <td>
                <ul class="breakdown">
                  ${breakdownItems}
                </ul>
              </td>
            </tr>
          `;
        })
        .join('')
    : `<tr><td colspan="5" class="empty">Aucun actionnaire évalué pour cette date.</td></tr>`;

  const notesSection = snapshot.notes
    ? `
      <section class="section">
        <h2>Notes internes</h2>
        <div class="notes">${formatMultiline(snapshot.notes)}</div>
      </section>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Rapport de valorisation – ${escapeHtml(companyLabel)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
            margin: 0;
            padding: 36px;
            background: #f8fafc;
            color: #0f172a;
          }
          h1 {
            margin: 0 0 6px;
            font-size: 28px;
            color: #0f172a;
          }
          .subtitle {
            color: #475569;
            margin-bottom: 24px;
          }
          .section {
            background: #ffffff;
            border-radius: 18px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
          }
          .section h2 {
            margin: 0 0 16px;
            font-size: 18px;
            color: #1e293b;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
          }
          th {
            background: #f1f5f9;
            color: #1f2937;
            font-weight: 600;
          }
          .numeric {
            text-align: right;
            font-feature-settings: 'tnum';
          }
          tr.total {
            font-weight: 600;
            background: #eff6ff;
          }
          td.highlight {
            font-weight: 600;
            color: #0f766e;
          }
          td .primary {
            font-weight: 600;
          }
          td .secondary {
            color: #64748b;
            font-size: 12px;
            margin-top: 2px;
          }
          .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: linear-gradient(135deg, #2563eb, #38bdf8);
            color: #ffffff;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 12px 28px rgba(37, 99, 235, 0.25);
          }
          .metric-card .label {
            display: block;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 6px;
            opacity: 0.85;
          }
          .metric-card .value {
            font-size: 22px;
            font-weight: 600;
          }
          .breakdown {
            list-style: none;
            padding: 0;
            margin: 0;
            display: grid;
            gap: 4px;
          }
          .breakdown li {
            display: flex;
            flex-direction: column;
            gap: 2px;
            background: #f8fafc;
            border-radius: 10px;
            padding: 8px 10px;
          }
          .breakdown li strong {
            font-weight: 600;
            color: #1e293b;
          }
          .breakdown li span {
            color: #475569;
            font-size: 12px;
          }
          .empty {
            text-align: center;
            padding: 18px 0;
            color: #64748b;
            font-style: italic;
          }
          .notes {
            background: #fef3c7;
            border-radius: 14px;
            padding: 18px;
            color: #92400e;
            font-size: 13px;
            line-height: 1.6;
          }
          .footnote {
            margin-top: 24px;
            color: #94a3b8;
            font-size: 11px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <h1>Valorisation du capital familial</h1>
        <div class="subtitle">${escapeHtml(companyLabel)} · Évaluation du ${escapeHtml(valuationDateLabel)} · Généré le ${escapeHtml(generatedAt)}</div>
        <div class="cards">
          ${summaryCards}
        </div>
        <section class="section">
          <h2>Immobilier corporatif</h2>
          <table>
            <thead>
              <tr>
                <th>Immeuble</th>
                <th class="numeric">Valeur marchande</th>
                <th class="numeric">Dettes</th>
                <th class="numeric">Valeur nette</th>
              </tr>
            </thead>
            <tbody>
              ${propertyTableBody}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Classes d'actions</h2>
          <table>
            <thead>
              <tr>
                <th>Classe</th>
                <th class="numeric">Actions en circulation</th>
                <th class="numeric">Prix par action</th>
                <th class="numeric">Valeur totale</th>
                <th>Participe à la croissance</th>
              </tr>
            </thead>
            <tbody>
              ${shareClassRows}
            </tbody>
          </table>
        </section>
        <section class="section">
          <h2>Actionnaires</h2>
          <table>
            <thead>
              <tr>
                <th>Actionnaire</th>
                <th class="numeric">Actions totales</th>
                <th class="numeric">% de participation</th>
                <th class="numeric">Valeur</th>
                <th>Détail par classe</th>
              </tr>
            </thead>
            <tbody>
              ${shareholderRows}
            </tbody>
          </table>
        </section>
        ${notesSection}
        <div class="footnote">Simulation interne à des fins de suivi du patrimoine familial. Ne constitue pas une évaluation indépendante officielle.</div>
      </body>
    </html>
  `;
}

async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const chromiumArgs = new Set<string>([...chromium.args]);
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    ['--single-process', '--no-zygote', "--headless='shell'"].forEach((flag) => chromiumArgs.delete(flag));
    chromiumArgs.add('--headless=new');
  }
  const platformFlags = isWindows
    ? ['--disable-gpu', '--disable-dev-shm-usage']
    : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote', '--single-process'];
  platformFlags.forEach((flag) => chromiumArgs.add(flag));

  const envExec = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  let executablePath = envExec && envExec.length > 0 ? envExec : null;

  if (!executablePath) {
    try {
      executablePath = await chromium.executablePath();
    } catch (error) {
      console.error('[PDF] Impossible de déterminer le chemin Chromium via @sparticuz/chromium', error);
    }
  }

  if (!executablePath) {
    const error = new Error(
      "Chromium n'est pas disponible dans l'environnement d'exécution. Fournissez PUPPETEER_EXECUTABLE_PATH ou vérifiez votre dépendance @sparticuz/chromium."
    );
    // @ts-expect-error ajout d'un status HTTP personnalisé
    error.status = 500;
    throw error;
  }

  const headlessMode = isWindows && chromium.headless === 'shell' ? 'new' : chromium.headless ?? 'new';

  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    args: Array.from(chromiumArgs),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: headlessMode
  };

  try {
    const browser = await puppeteer.launch(launchOptions);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buffer = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error('[PDF] Échec du rendu PDF', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      env: {
        node: process.version,
        PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || null,
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || null
      },
      resolvedExecutablePath: executablePath
    });
    const error = new Error('La génération du PDF a échoué. Voir les logs du serveur pour le détail.');
    // @ts-expect-error attacher un status au besoin
    error.status = 500;
    throw error;
  }
}

export async function generateSummaryPdf(summary: SummaryResponse): Promise<Buffer> {
  return renderPdfFromHtml(renderSummaryHtml(summary));
}

export async function generateAnnualReportPdf(report: AnnualReportData): Promise<Buffer> {
  return renderPdfFromHtml(renderAnnualReportHtml(report));
}

export async function generateLeveragedBuybackPdf(payload: LeveragedBuybackPdfPayload): Promise<Buffer> {
  return renderPdfFromHtml(renderLeveragedBuybackHtml(payload));
}

export async function generateValuationReportPdf(snapshot: ValuationSnapshotDto): Promise<Buffer> {
  return renderPdfFromHtml(renderValuationReportHtml(snapshot));
}

export async function generateRentalTaxStatementPdf(payload: RentalTaxPdfPayload): Promise<Buffer> {
  return renderPdfFromHtml(renderRentalTaxStatementHtml(payload));
}
