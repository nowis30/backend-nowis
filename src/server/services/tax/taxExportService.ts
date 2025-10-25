import { prisma } from '../../lib/prisma';

function escapeCsv(value: string): string {
  const sanitized = value.replace(/"/g, '""');
  return `"${sanitized}"`;
}

function buildDateRange(year?: number) {
  if (!year) {
    return undefined;
  }

  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  } as const;
}

function formatCurrency(value: number): string {
  return value.toFixed(2);
}

export async function buildT5Csv(userId: number, year: number): Promise<string> {
  const dividends = await prisma.dividendDeclaration.findMany({
    where: {
      company: { userId },
      declarationDate: buildDateRange(year)
    },
    include: {
      company: { select: { name: true, neq: true } },
      shareholder: { select: { displayName: true, contactEmail: true } },
      shareClass: { select: { code: true } }
    },
    orderBy: [{ declarationDate: 'asc' }, { id: 'asc' }]
  });

  const headers = [
    'No société',
    'Société',
    'Beneficiaire',
    'Courriel',
    'Classe',
    'Type dividende',
    'Montant',
    'Taux majoration',
    'Montant majoré',
    'Crédit fédéral',
    'Crédit provincial',
    'Date déclaration',
    'Date paiement'
  ];

  const rows = dividends.map((record) => [
    record.company.neq ?? '',
    record.company.name,
    record.shareholder.displayName,
    record.shareholder.contactEmail ?? '',
    record.shareClass?.code ?? '',
    record.dividendType,
    formatCurrency(Number(record.amount)),
    formatCurrency(Number(record.grossUpRate)),
    formatCurrency(Number(record.grossedAmount)),
    formatCurrency(Number(record.federalCredit)),
    formatCurrency(Number(record.provincialCredit)),
    record.declarationDate.toISOString().slice(0, 10),
    record.paymentDate ? record.paymentDate.toISOString().slice(0, 10) : ''
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export async function buildRl3Csv(userId: number, year: number): Promise<string> {
  const dividends = await prisma.dividendDeclaration.findMany({
    where: {
      company: { userId },
      declarationDate: buildDateRange(year)
    },
    include: {
      company: { select: { name: true } },
      shareholder: { select: { displayName: true } }
    },
    orderBy: [{ declarationDate: 'asc' }, { id: 'asc' }]
  });

  const headers = [
    'Année',
    'Bénéficiaire',
    'Société',
    'Type',
    'Montant',
    'Montant majoré',
    'Crédit Qc'
  ];

  const rows = dividends.map((record) => [
    year.toString(),
    record.shareholder.displayName,
    record.company.name,
    record.dividendType,
    formatCurrency(Number(record.amount)),
    formatCurrency(Number(record.grossedAmount)),
    formatCurrency(Number(record.provincialCredit))
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export async function buildT4Csv(userId: number, year: number): Promise<string> {
  const personalReturns = await prisma.personalTaxReturn.findMany({
    where: {
      taxYear: year,
      shareholder: { userId }
    },
    include: {
      shareholder: { select: { displayName: true, contactEmail: true } }
    },
    orderBy: [{ shareholderId: 'asc' }]
  });

  const headers = [
    'Année',
    'Employé',
    'Courriel',
    'Revenu emploi',
    'Revenu affaires',
    'Dividendes admissibles',
    'Dividendes non admissibles',
    'Gains en capital imposables',
    'Impôt fédéral',
    'Impôt provincial'
  ];

  const rows = personalReturns.map((record) => [
    record.taxYear.toString(),
    record.shareholder.displayName,
    record.shareholder.contactEmail ?? '',
    formatCurrency(Number(record.employmentIncome ?? 0)),
    formatCurrency(Number(record.businessIncome ?? 0)),
    formatCurrency(Number(record.eligibleDividends ?? 0)),
    formatCurrency(Number(record.nonEligibleDividends ?? 0)),
    formatCurrency(Number(record.capitalGains ?? 0)),
    formatCurrency(Number(record.federalTax ?? 0)),
    formatCurrency(Number(record.provincialTax ?? 0))
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export async function buildRl1Csv(userId: number, year: number): Promise<string> {
  const personalReturns = await prisma.personalTaxReturn.findMany({
    where: {
      taxYear: year,
      shareholder: { userId }
    },
    include: {
      shareholder: { select: { displayName: true } }
    },
    orderBy: [{ shareholderId: 'asc' }]
  });

  const headers = [
    'Année',
    'Employé',
    'Revenu emploi',
    'Dividendes admissibles',
    'Dividendes non admissibles',
    'Gains en capital imposables',
    'Impôt Québec'
  ];

  const rows = personalReturns.map((record) => [
    record.taxYear.toString(),
    record.shareholder.displayName,
    formatCurrency(Number(record.employmentIncome ?? 0)),
    formatCurrency(Number(record.eligibleDividends ?? 0)),
    formatCurrency(Number(record.nonEligibleDividends ?? 0)),
    formatCurrency(Number(record.capitalGains ?? 0)),
    formatCurrency(Number(record.provincialTax ?? 0))
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
