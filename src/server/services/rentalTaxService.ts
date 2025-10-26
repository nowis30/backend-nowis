import { Prisma, RentalTaxFormType } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { buildAmortizationSchedule } from './amortization';

const FREQUENCIES = ['PONCTUEL', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'] as const;
type Frequency = (typeof FREQUENCIES)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampToYear(value: Date, taxYear: number): Date {
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59, 999);
  if (value < yearStart) {
    return yearStart;
  }
  if (value > yearEnd) {
    return yearEnd;
  }
  return value;
}

function computeOccurrences(
  frequency: Frequency,
  start: Date,
  end: Date,
  taxYear: number
): number {
  const yearStart = new Date(taxYear, 0, 1);
  const yearEnd = new Date(taxYear, 11, 31, 23, 59, 59, 999);

  if (end < yearStart || start > yearEnd) {
    return 0;
  }

  const effectiveStart = clampToYear(start, taxYear);
  const effectiveEnd = clampToYear(end, taxYear);

  if (effectiveEnd < effectiveStart) {
    return 0;
  }

  if (frequency === 'PONCTUEL') {
    return start.getFullYear() === taxYear ? 1 : 0;
  }

  if (frequency === 'ANNUEL') {
    return 1;
  }

  if (frequency === 'HEBDOMADAIRE') {
    const diff = effectiveEnd.getTime() - effectiveStart.getTime();
    return Math.floor(diff / MS_PER_WEEK) + 1;
  }

  const totalMonths =
    (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 +
    (effectiveEnd.getMonth() - effectiveStart.getMonth()) +
    1;

  if (frequency === 'MENSUEL') {
    return totalMonths;
  }

  if (frequency === 'TRIMESTRIEL') {
    return Math.max(1, Math.round(totalMonths / 3));
  }

  return 0;
}

function annualizeAmount(
  amount: number,
  frequency: Frequency,
  startDate: Date | null,
  endDate: Date | null,
  taxYear: number
): number {
  if (amount === 0) {
    return 0;
  }

  const start = startDate ?? new Date(taxYear, 0, 1);
  const end = endDate ?? new Date(taxYear, 11, 31, 23, 59, 59, 999);
  const occurrences = computeOccurrences(frequency, start, end, taxYear);
  return occurrences * amount;
}

function safeFrequency(value: string | null | undefined): Frequency {
  if (!value) {
    return 'PONCTUEL';
  }

  if (FREQUENCIES.includes(value as Frequency)) {
    return value as Frequency;
  }

  return 'PONCTUEL';
}

interface RentalTaxExpenseLine {
  key: string;
  label: string;
  amount: number;
  category?: string | null;
}

interface RentalTaxIncomeLine {
  key: string;
  label: string;
  amount: number;
}

export interface RentalTaxComputedData {
  grossRents: number;
  otherIncome: number;
  totalIncome: number;
  expenses: RentalTaxExpenseLine[];
  totalExpenses: number;
  netIncome: number;
  mortgageInterest: number;
  capitalCostAllowance: number;
  incomeDetails: RentalTaxIncomeLine[];
}

export interface RentalTaxFormPayload {
  income: {
    grossRents: number;
    otherIncome: number;
    totalIncome: number;
  };
  expenses: RentalTaxExpenseLine[];
  totals: {
    totalExpenses: number;
    netIncome: number;
  };
}

export interface RentalTaxStatementDto {
  id: number;
  formType: RentalTaxFormType;
  taxYear: number;
  propertyId: number | null;
  propertyName: string | null;
  propertyAddress: string | null;
  payload: RentalTaxFormPayload;
  computed: RentalTaxComputedData;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentalTaxPrepareInput {
  taxYear: number;
  formType: RentalTaxFormType;
  propertyId?: number | null;
}

export interface RentalTaxPrepareResult {
  taxYear: number;
  formType: RentalTaxFormType;
  property: {
    id: number;
    name: string;
    address: string | null;
  } | null;
  computed: RentalTaxComputedData;
  payloadTemplate: RentalTaxFormPayload;
  previous?: RentalTaxStatementDto | null;
}

interface RentalTaxCreateInput {
  taxYear: number;
  formType: RentalTaxFormType;
  propertyId?: number | null;
  payload: RentalTaxFormPayload;
  notes?: string | null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculateCca(
  depreciationInfo: {
    ccaRate?: Prisma.Decimal | number | null;
    openingUcc?: Prisma.Decimal | number | null;
    additions?: Prisma.Decimal | number | null;
    dispositions?: Prisma.Decimal | number | null;
  } | null,
  netIncomeBeforeCca: number
): number {
  if (!depreciationInfo) {
    return 0;
  }

  const rate = toNumber(depreciationInfo.ccaRate) / 100;
  const opening = toNumber(depreciationInfo.openingUcc);
  const additions = toNumber(depreciationInfo.additions);
  const dispositions = toNumber(depreciationInfo.dispositions);

  const base = Math.max(0, opening + additions / 2 - dispositions);
  const ccaMax = Math.max(0, base * rate);
  const netIncome = Math.max(0, netIncomeBeforeCca);

  return round(Math.min(ccaMax, netIncome));
}

async function findPreviousStatement(
  userId: number,
  formType: RentalTaxFormType,
  propertyId: number | null,
  taxYear: number
): Promise<RentalTaxStatementDto | null> {
  const previous = await prisma.rentalTaxStatement.findFirst({
    where: {
      userId,
      formType,
      propertyId,
      taxYear: { lt: taxYear }
    },
    orderBy: [{ taxYear: 'desc' }, { createdAt: 'desc' }],
    include: {
      property: {
        select: { id: true, name: true, address: true }
      }
    }
  });

  return previous ? serializeRentalTaxStatement(previous) : null;
}

function ensureTotals(payload: RentalTaxFormPayload): RentalTaxFormPayload {
  const grossRents = round(Math.max(0, payload.income.grossRents || 0));
  const otherIncome = round(Math.max(0, payload.income.otherIncome || 0));
  const totalIncome = round(grossRents + otherIncome);
  const expenses = payload.expenses.map((line) => ({
    ...line,
    amount: round(Math.max(0, line.amount || 0))
  }));
  const totalExpenses = round(expenses.reduce((acc, line) => acc + line.amount, 0));
  const netIncome = round(totalIncome - totalExpenses);

  return {
    income: {
      grossRents,
      otherIncome,
      totalIncome
    },
    expenses,
    totals: {
      totalExpenses,
      netIncome
    }
  };
}

function serializeRentalTaxStatement(
  statement: Prisma.RentalTaxStatementGetPayload<{
    include: {
      property: {
        select: { id: true; name: true; address: true };
      };
    };
  }>
): RentalTaxStatementDto {
  return {
    id: statement.id,
    formType: statement.formType,
    taxYear: statement.taxYear,
    propertyId: statement.propertyId ?? null,
    propertyName: statement.property?.name ?? null,
    propertyAddress: statement.property?.address ?? null,
    payload: statement.payload as unknown as RentalTaxFormPayload,
    computed: statement.computed as unknown as RentalTaxComputedData,
    notes: statement.notes ?? null,
    createdAt: statement.createdAt.toISOString(),
    updatedAt: statement.updatedAt.toISOString()
  };
}

async function computeRentalTaxData(
  userId: number,
  propertyId: number | null,
  taxYear: number
): Promise<{
  computed: RentalTaxComputedData;
  property: { id: number; name: string; address: string | null } | null;
}> {
  const propertyFilter = propertyId ? { id: propertyId } : {};

  const properties = await prisma.property.findMany({
    where: { userId, ...propertyFilter },
    include: {
      revenues: true,
      expenses: true,
      invoices: true,
      mortgages: true,
      depreciationInfo: true
    }
  });

  if (properties.length === 0) {
    throw new Error('Aucun immeuble correspondant.');
  }

  let grossRents = 0;
  let otherIncome = 0;
  const incomeDetails: RentalTaxIncomeLine[] = [];

  const expenseAccumulator = new Map<string, RentalTaxExpenseLine>();
  let mortgageInterest = 0;
  let capitalCostAllowance = 0;

  properties.forEach((property) => {
    property.revenues.forEach((revenue) => {
      const amount = toNumber(revenue.amount);
      const startDate = normalizeDate(revenue.startDate);
      const endDate = normalizeDate(revenue.endDate);
      const frequency = safeFrequency(revenue.frequency);
      const annualAmount = annualizeAmount(amount, frequency, startDate, endDate, taxYear);

      if (annualAmount === 0) {
        return;
      }

      const normalizedLabel = (revenue.label ?? '').toLowerCase();
      const isRent = normalizedLabel.includes('loyer') || normalizedLabel.includes('rent');
      if (isRent) {
        grossRents += annualAmount;
      } else {
        otherIncome += annualAmount;
      }

      incomeDetails.push({
        key: `revenue-${revenue.id}`,
        label: revenue.label ?? 'Revenu',
        amount: round(annualAmount)
      });
    });

    property.expenses.forEach((expense) => {
      const amount = toNumber(expense.amount);
      const startDate = normalizeDate(expense.startDate);
      const endDate = normalizeDate(expense.endDate);
      const frequency = safeFrequency(expense.frequency);
      const annualAmount = annualizeAmount(amount, frequency, startDate, endDate, taxYear);

      if (annualAmount === 0) {
        return;
      }

      const key = `expense-${expense.category ?? 'Autre'}-${expense.id}`;
      expenseAccumulator.set(key, {
        key,
        label: expense.label ?? expense.category ?? 'Dépense',
        category: expense.category,
        amount: round(annualAmount)
      });
    });

    property.invoices.forEach((invoice) => {
      const date = normalizeDate(invoice.invoiceDate);
      if (!date || date.getFullYear() !== taxYear) {
        return;
      }
      const base = toNumber(invoice.amount);
      const gst = toNumber(invoice.gst);
      const qst = toNumber(invoice.qst);
      const total = round(base + gst + qst);
      if (total === 0) {
        return;
      }
      const key = `invoice-${invoice.id}`;
      expenseAccumulator.set(key, {
        key,
        label: invoice.description ?? invoice.supplier ?? 'Facture',
        category: invoice.category,
        amount: total
      });
    });

    property.mortgages.forEach((mortgage) => {
      const schedule = buildAmortizationSchedule({
        principal: toNumber(mortgage.principal),
        rateAnnual: toNumber(mortgage.rateAnnual),
        amortizationMonths: mortgage.amortizationMonths,
        paymentFrequency: mortgage.paymentFrequency,
        startDate: mortgage.startDate,
        paymentAmount: toNumber(mortgage.paymentAmount),
        termMonths: mortgage.termMonths
      });

      const annual = schedule.annualBreakdown.find((entry) => entry.year === taxYear);
      if (annual) {
        mortgageInterest += annual.totalInterest;
      }
    });

    const expensesTotal = Array.from(expenseAccumulator.values()).reduce((acc, line) => acc + line.amount, 0);
    const netIncomeBeforeCca = grossRents + otherIncome - expensesTotal - mortgageInterest;
    capitalCostAllowance += calculateCca(property.depreciationInfo, netIncomeBeforeCca);
  });

  if (mortgageInterest > 0) {
    const key = 'expense-mortgage-interest';
    expenseAccumulator.set(key, {
      key,
      label: 'Intérêts hypothécaires',
      category: 'Intérêts',
      amount: round(mortgageInterest)
    });
  }

  if (capitalCostAllowance > 0) {
    const key = 'expense-cca';
    expenseAccumulator.set(key, {
      key,
      label: 'Déduction pour amortissement (CCA)',
      category: 'CCA',
      amount: round(capitalCostAllowance)
    });
  }

  const expenses = Array.from(expenseAccumulator.values());
  const totalExpenses = round(expenses.reduce((acc, line) => acc + line.amount, 0));
  const grossRentsRounded = round(grossRents);
  const otherIncomeRounded = round(otherIncome);
  const totalIncome = round(grossRentsRounded + otherIncomeRounded);
  const netIncome = round(totalIncome - totalExpenses);

  const property = propertyId && properties[0]
    ? {
        id: properties[0].id,
        name: properties[0].name,
        address: properties[0].address ?? null
      }
    : null;

  const computed: RentalTaxComputedData = {
    grossRents: grossRentsRounded,
    otherIncome: otherIncomeRounded,
    totalIncome,
    expenses,
    totalExpenses,
    netIncome,
    mortgageInterest: round(mortgageInterest),
    capitalCostAllowance: round(capitalCostAllowance),
    incomeDetails: incomeDetails.sort((a, b) => a.label.localeCompare(b.label))
  };

  return { computed, property };
}

export async function prepareRentalTaxStatement(
  userId: number,
  input: RentalTaxPrepareInput
): Promise<RentalTaxPrepareResult> {
  const taxYear = input.taxYear;
  if (!Number.isFinite(taxYear) || taxYear < 2000 || taxYear > new Date().getFullYear() + 1) {
    throw new Error('Année fiscale invalide.');
  }

  const propertyId = input.propertyId ?? null;

  const { computed, property } = await computeRentalTaxData(userId, propertyId, taxYear);
  const previous = await findPreviousStatement(userId, input.formType, propertyId, taxYear);

  const payloadTemplate = ensureTotals(
    previous?.payload ?? {
      income: {
        grossRents: computed.grossRents,
        otherIncome: computed.otherIncome,
        totalIncome: computed.totalIncome
      },
      expenses: computed.expenses,
      totals: {
        totalExpenses: computed.totalExpenses,
        netIncome: computed.netIncome
      }
    }
  );

  return {
    taxYear,
    formType: input.formType,
    property,
    computed,
    payloadTemplate,
    previous
  };
}

export async function createRentalTaxStatement(
  userId: number,
  input: RentalTaxCreateInput
): Promise<RentalTaxStatementDto> {
  const propertyId = input.propertyId ?? null;
  const { computed } = await computeRentalTaxData(userId, propertyId, input.taxYear);
  const payload = ensureTotals(input.payload);

  const created = await prisma.rentalTaxStatement.create({
    data: {
      userId,
      propertyId,
      formType: input.formType,
      taxYear: input.taxYear,
      payload: payload as unknown as Prisma.InputJsonValue,
      computed: computed as unknown as Prisma.InputJsonValue,
      notes: input.notes ?? null
    },
    include: {
      property: {
        select: { id: true, name: true, address: true }
      }
    }
  });

  return serializeRentalTaxStatement({
    ...created,
    payload: payload as unknown as Prisma.JsonValue,
    computed: computed as unknown as Prisma.JsonValue
  });
}

export async function listRentalTaxStatements(userId: number): Promise<RentalTaxStatementDto[]> {
  const statements = await prisma.rentalTaxStatement.findMany({
    where: { userId },
    orderBy: [{ taxYear: 'desc' }, { createdAt: 'desc' }],
    include: {
      property: {
        select: { id: true, name: true, address: true }
      }
    }
  });

  return statements.map(serializeRentalTaxStatement);
}

export async function getRentalTaxStatement(
  userId: number,
  id: number
): Promise<RentalTaxStatementDto | null> {
  const statement = await prisma.rentalTaxStatement.findFirst({
    where: { id, userId },
    include: {
      property: {
        select: { id: true, name: true, address: true }
      }
    }
  });

  return statement ? serializeRentalTaxStatement(statement) : null;
}
