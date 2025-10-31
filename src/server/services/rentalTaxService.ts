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
  lineNumber?: string | null;
  hint?: string | null;
  description?: string | null;
}

interface RentalTaxIncomeLine {
  key: string;
  label: string;
  amount: number;
}

type RentalTaxMetadataFieldType = 'text' | 'number' | 'percentage' | 'date' | 'textarea';

interface RentalTaxMetadataField {
  key: string;
  label: string;
  value: string | number | null;
  type?: RentalTaxMetadataFieldType;
  hint?: string | null;
  lineNumber?: string | null;
}

interface RentalTaxIncomeLabels {
  grossRents: string;
  otherIncome: string;
  totalIncome: string;
  grossRentsLine?: string | null;
  otherIncomeLine?: string | null;
  totalIncomeLine?: string | null;
}

interface RentalTaxCcaLine {
  key: string;
  classNumber: string;
  description?: string | null;
  ccaRate?: number | null;
  openingBalance?: number | null;
  additions?: number | null;
  dispositions?: number | null;
  baseForCca?: number | null;
  ccaAmount?: number | null;
  closingBalance?: number | null;
}

interface FormMetadataDefinition {
  key: string;
  label: string;
  type?: RentalTaxMetadataFieldType;
  hint?: string | null;
  lineNumber?: string | null;
  source?: 'propertyAddress' | 'propertyName' | 'taxYear';
}

interface FormExpenseDefinition {
  key: string;
  label: string;
  lineNumber?: string | null;
  hint?: string | null;
  matchers?: string[];
  fallback?: boolean;
  defaultCategory?: string | null;
  description?: string | null;
}

interface FormDefinitionConfig {
  incomeLabels: RentalTaxIncomeLabels;
  metadata: FormMetadataDefinition[];
  expenses: FormExpenseDefinition[];
}

const T776_DEFINITIONS: FormDefinitionConfig = {
  incomeLabels: {
    grossRents: 'Loyers bruts (ligne 8141)',
    otherIncome: 'Autres revenus (ligne 8230)',
    totalIncome: 'Total des revenus (ligne 8299)',
    grossRentsLine: '8141',
    otherIncomeLine: '8230',
    totalIncomeLine: '8299'
  },
  metadata: [
    {
      key: 'propertyAddress',
      label: "Adresse de l'immeuble (partie 1)",
      type: 'textarea',
      source: 'propertyAddress'
    },
    {
      key: 'taxYear',
      label: 'Année fiscale',
      type: 'number',
      source: 'taxYear'
    },
    {
      key: 'ownershipPercentage',
      label: 'Pourcentage de participation',
      type: 'percentage',
      hint: 'Indique la part de propriété (ex. 100, 50).' 
    },
    {
      key: 'coOwners',
      label: 'Autres copropriétaires (noms et NAS)',
      type: 'textarea'
    }
  ],
  expenses: [
    {
      key: 'advertising',
      label: 'Publicité',
      lineNumber: '8521',
      matchers: ['publicité', 'advertising', 'promo']
    },
    {
      key: 'insurance',
      label: 'Assurance',
      lineNumber: '8690',
      matchers: ['assurance', 'insurance']
    },
    {
      key: 'interest',
      label: 'Intérêts et frais financiers',
      lineNumber: '8710',
      matchers: ['intér', 'interest', 'hypoth', 'financ']
    },
    {
      key: 'office',
      label: 'Frais de bureau',
      lineNumber: '8810',
      matchers: ['bureau', 'office', 'papeterie']
    },
    {
      key: 'professional',
      label: 'Honoraires professionnels',
      lineNumber: '8860',
      matchers: ['honoraires', 'comptable', 'avocat', 'legal', 'professional', 'notaire']
    },
    {
      key: 'management',
      label: 'Gestion et administration',
      lineNumber: '8871',
      matchers: ['gestion', 'administr', 'management', 'admin']
    },
    {
      key: 'repairs',
      label: 'Entretien et réparations',
      lineNumber: '8910',
      matchers: ['entretien', 'répar', 'repair', 'maintenance']
    },
    {
      key: 'salaries',
      label: 'Salaires, avantages et contrats',
      lineNumber: '8960',
      matchers: ['salaire', 'wage', 'payroll', 'avantage', 'benefit', 'contrat']
    },
    {
      key: 'taxes',
      label: 'Taxes municipales et scolaires',
      lineNumber: '9060',
      matchers: ['taxe', 'taxes', 'municip', 'school', 'fonci']
    },
    {
      key: 'travel',
      label: 'Frais de déplacement',
      lineNumber: '9180',
      matchers: ['déplacement', 'travel', 'voyage', 'kilom']
    },
    {
      key: 'utilities',
      label: 'Services publics (électricité, chauffage, eau)',
      lineNumber: '9200',
      matchers: ['électric', 'hydro', 'chauff', 'gaz', 'utility', 'eau', 'water']
    },
    {
      key: 'vehicle',
      label: 'Dépenses de véhicule motorisé',
      lineNumber: '9281',
      matchers: ['véhicule', 'vehicle', 'auto', 'voiture', 'camion', 'truck']
    },
    {
      key: 'other',
      label: 'Autres dépenses',
      lineNumber: '9270',
      hint: 'Inclure tout poste non répertorié ailleurs.',
      fallback: true
    },
    {
      key: 'cca',
      label: 'Déduction pour amortissement (CCA)',
      lineNumber: '9936',
      matchers: ['cca', 'amortissement', 'depreciation']
    }
  ]
};

const TP128_DEFINITIONS: FormDefinitionConfig = {
  incomeLabels: {
    grossRents: 'Revenus bruts de loyers (ligne 12)',
    otherIncome: 'Autres revenus (ligne 16)',
    totalIncome: 'Revenus totaux (ligne 19)',
    grossRentsLine: '12',
    otherIncomeLine: '16',
    totalIncomeLine: '19'
  },
  metadata: [
    {
      key: 'propertyAddress',
      label: "Adresse de l'immeuble locatif",
      type: 'textarea',
      source: 'propertyAddress'
    },
    {
      key: 'municipalRoll',
      label: "Numéro de rôle d'évaluation",
      type: 'text'
    },
    {
      key: 'taxYear',
      label: 'Année fiscale',
      type: 'number',
      source: 'taxYear'
    },
    {
      key: 'personalUsePercentage',
      label: "Pourcentage d'utilisation personnelle",
      type: 'percentage',
      hint: 'Indiquer la portion utilisée à des fins personnelles.'
    },
    {
      key: 'unitsRented',
      label: 'Nombre d’unités louées',
      type: 'number'
    },
    {
      key: 'unitsVacant',
      label: 'Nombre d’unités vacantes',
      type: 'number'
    }
  ],
  expenses: [
    {
      key: 'interest',
      label: 'Intérêts sur dettes',
      lineNumber: '203',
      matchers: ['intér', 'interest', 'hypoth', 'financ']
    },
    {
      key: 'taxes',
      label: 'Taxes municipales et scolaires',
      lineNumber: '206',
      matchers: ['taxe', 'taxes', 'municip', 'school', 'fonci']
    },
    {
      key: 'insurance',
      label: 'Assurance',
      lineNumber: '209',
      matchers: ['assurance', 'insurance']
    },
    {
      key: 'utilities',
      label: 'Chauffage, électricité et eau',
      lineNumber: '212',
      matchers: ['électric', 'hydro', 'chauff', 'gaz', 'utility', 'eau', 'water']
    },
    {
      key: 'repairs',
      label: 'Entretien et réparations',
      lineNumber: '215',
      matchers: ['entretien', 'répar', 'repair', 'maintenance']
    },
    {
      key: 'management',
      label: 'Gestion et administration',
      lineNumber: '218',
      matchers: ['gestion', 'administr', 'management', 'admin']
    },
    {
      key: 'salaries',
      label: 'Salaires et avantages',
      lineNumber: '221',
      matchers: ['salaire', 'wage', 'payroll', 'avantage', 'benefit', 'contrat']
    },
    {
      key: 'supplies',
      label: 'Fournitures et petits outils',
      lineNumber: '224',
      matchers: ['fourniture', 'supply', 'outil', 'outils']
    },
    {
      key: 'professional',
      label: 'Honoraires professionnels',
      lineNumber: '227',
      matchers: ['honoraires', 'comptable', 'avocat', 'legal', 'professional', 'notaire']
    },
    {
      key: 'travel',
      label: 'Frais de déplacement',
      lineNumber: '230',
      matchers: ['déplacement', 'travel', 'voyage', 'kilom']
    },
    {
      key: 'other',
      label: 'Autres dépenses',
      lineNumber: '233',
      hint: 'Inclure les dépenses non répertoriées dans les lignes précédentes.',
      fallback: true
    },
    {
      key: 'cca',
      label: 'Amortissement (CCA)',
      lineNumber: '235',
      matchers: ['cca', 'amortissement', 'depreciation']
    }
  ]
};

const FORM_DEFINITIONS: Record<RentalTaxFormType, FormDefinitionConfig> = {
  T776: T776_DEFINITIONS,
  TP128: TP128_DEFINITIONS
};

function normalizeMatcherInput(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function buildMetadataFields(
  definitions: FormMetadataDefinition[],
  property: { name: string; address: string | null } | null,
  taxYear: number,
  previous: RentalTaxMetadataField[] | undefined | null
): RentalTaxMetadataField[] {
  const previousMap = new Map((previous ?? []).map((field) => [field.key, field]));

  return definitions.map((definition) => {
    const previousField = previousMap.get(definition.key);
    let value: string | number | null = previousField?.value ?? null;

    if (previousField === undefined) {
      if (definition.source === 'propertyAddress') {
        value = property?.address ?? property?.name ?? null;
      } else if (definition.source === 'propertyName') {
        value = property?.name ?? null;
      } else if (definition.source === 'taxYear') {
        value = taxYear;
      }
    }

    return {
      key: definition.key,
      label: definition.label,
      type: definition.type,
      hint: definition.hint ?? null,
      lineNumber: definition.lineNumber ?? null,
      value
    } satisfies RentalTaxMetadataField;
  });
}

function allocateExpenseAmounts(
  computed: RentalTaxComputedData,
  definitions: FormExpenseDefinition[]
): Map<string, number> {
  const amounts = new Map<string, number>();
  definitions.forEach((definition) => {
    amounts.set(definition.key, 0);
  });

  const fallback = definitions.find((definition) => definition.fallback)?.key ?? null;

  computed.expenses.forEach((expense) => {
    const normalizedCategory = normalizeMatcherInput(expense.category ?? null);
    const normalizedLabel = normalizeMatcherInput(expense.label);

    const matched = definitions.find((definition) =>
      definition.matchers?.some((matcher) =>
        normalizedCategory.includes(matcher) || normalizedLabel.includes(matcher)
      )
    );

    if (matched) {
      const current = amounts.get(matched.key) ?? 0;
      amounts.set(matched.key, round(current + expense.amount));
      return;
    }

    if (fallback) {
      const current = amounts.get(fallback) ?? 0;
      amounts.set(fallback, round(current + expense.amount));
    }
  });

  return amounts;
}

function buildFormPayload(params: {
  formType: RentalTaxFormType;
  computed: RentalTaxComputedData;
  property: { id: number; name: string; address: string | null } | null;
  taxYear: number;
  previous?: RentalTaxFormPayload | null;
}): RentalTaxFormPayload {
  const definition = FORM_DEFINITIONS[params.formType];
  const previous = params.previous ?? null;

  const metadata = buildMetadataFields(
    definition.metadata,
    params.property,
    params.taxYear,
    previous?.metadata
  );

  const income = {
    grossRents: previous?.income?.grossRents ?? params.computed.grossRents,
    otherIncome: previous?.income?.otherIncome ?? params.computed.otherIncome,
    totalIncome: previous?.income?.totalIncome ?? params.computed.totalIncome
  };

  const expenseAmounts = allocateExpenseAmounts(params.computed, definition.expenses);
  const previousExpenseMap = new Map((previous?.expenses ?? []).map((line) => [line.key, line]));

  const expenses = definition.expenses.map((expenseDefinition) => {
    const previousLine = previousExpenseMap.get(expenseDefinition.key);
    const amount =
      previousLine && previousLine.amount !== undefined
        ? previousLine.amount
        : expenseAmounts.get(expenseDefinition.key) ?? 0;

    return {
      key: expenseDefinition.key,
      label: expenseDefinition.label,
      lineNumber: expenseDefinition.lineNumber ?? null,
      hint: expenseDefinition.hint ?? null,
      category: previousLine?.category ?? expenseDefinition.defaultCategory ?? null,
      description: previousLine?.description ?? expenseDefinition.description ?? null,
      amount
    } satisfies RentalTaxExpenseLine;
  });

  const computedCcaMap = new Map(params.computed.ccaDetails.map((line) => [line.key, line]));
  const previousCcaMap = new Map((previous?.cca ?? []).map((line) => [line.key, line]));
  const cca: RentalTaxCcaLine[] = [];

  if (computedCcaMap.size > 0) {
    computedCcaMap.forEach((line, key) => {
      const previousLine = previousCcaMap.get(key);
      cca.push({
        key,
        classNumber: previousLine?.classNumber ?? line.classNumber,
        description: previousLine?.description ?? line.description ?? null,
        ccaRate: previousLine?.ccaRate ?? line.ccaRate ?? null,
        openingBalance: previousLine?.openingBalance ?? line.openingBalance ?? null,
        additions: previousLine?.additions ?? line.additions ?? null,
        dispositions: previousLine?.dispositions ?? line.dispositions ?? null,
        baseForCca: previousLine?.baseForCca ?? line.baseForCca ?? null,
        ccaAmount: previousLine?.ccaAmount ?? line.ccaAmount ?? null,
        closingBalance: previousLine?.closingBalance ?? line.closingBalance ?? null
      });
    });
  }

  (previous?.cca ?? []).forEach((line) => {
    if (!computedCcaMap.has(line.key)) {
      cca.push(line);
    }
  });

  return {
    metadata,
    income,
    incomeLabels: definition.incomeLabels,
    expenses,
    cca: cca.length > 0 ? cca : undefined,
    totals: previous?.totals ?? {
      totalExpenses: 0,
      netIncome: 0
    }
  } satisfies RentalTaxFormPayload;
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
  ccaDetails: RentalTaxCcaLine[];
}

export interface RentalTaxFormPayload {
  metadata?: RentalTaxMetadataField[];
  income: {
    grossRents: number;
    otherIncome: number;
    totalIncome: number;
  };
  incomeLabels?: RentalTaxIncomeLabels;
  expenses: RentalTaxExpenseLine[];
  cca?: RentalTaxCcaLine[];
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
    classCode?: string | null;
  } | null,
  netIncomeBeforeCca: number,
  context: { propertyId: number; propertyName?: string | null }
): { amount: number; detail?: RentalTaxCcaLine } {
  if (!depreciationInfo) {
    return { amount: 0 };
  }

  const ratePercent = toNumber(depreciationInfo.ccaRate);
  const rate = ratePercent / 100;
  const opening = toNumber(depreciationInfo.openingUcc);
  const additions = toNumber(depreciationInfo.additions);
  const dispositions = toNumber(depreciationInfo.dispositions);

  const base = Math.max(0, opening + additions / 2 - dispositions);
  const ccaMax = Math.max(0, base * rate);
  const netIncome = Math.max(0, netIncomeBeforeCca);
  const amount = round(Math.min(ccaMax, netIncome));
  const closing = round(Math.max(0, opening + additions - dispositions - amount));

  const detail: RentalTaxCcaLine = {
    key: `cca-${context.propertyId}`,
    classNumber: depreciationInfo.classCode ?? 'Immobilisations',
    description: context.propertyName ?? 'Immeuble locatif',
    ccaRate: ratePercent ? round(ratePercent, 2) : null,
    openingBalance: round(opening),
    additions: round(additions),
    dispositions: round(dispositions),
    baseForCca: round(base),
    ccaAmount: amount,
    closingBalance: closing
  };

  return {
    amount,
    detail
  };
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

function normalizeMetadataField(field: RentalTaxMetadataField): RentalTaxMetadataField {
  const value = field.value;
  if (field.type === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value ?? 0);
    return {
      ...field,
      value: Number.isFinite(parsed) ? round(parsed) : 0
    };
  }

  if (field.type === 'percentage') {
    const parsed = typeof value === 'number' ? value : Number(value ?? 0);
    return {
      ...field,
      value: Number.isFinite(parsed) ? round(parsed, 2) : 0
    };
  }

  return field;
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
    metadata: payload.metadata?.map(normalizeMetadataField),
    income: {
      grossRents,
      otherIncome,
      totalIncome
    },
    incomeLabels: payload.incomeLabels,
    expenses,
    cca: payload.cca?.map((line) => ({
      ...line,
      ccaRate:
        line.ccaRate === null || line.ccaRate === undefined
          ? null
          : round(Number(line.ccaRate), 2),
      openingBalance:
        line.openingBalance === null || line.openingBalance === undefined
          ? null
          : round(Number(line.openingBalance)),
      additions:
        line.additions === null || line.additions === undefined
          ? null
          : round(Number(line.additions)),
      dispositions:
        line.dispositions === null || line.dispositions === undefined
          ? null
          : round(Number(line.dispositions)),
      baseForCca:
        line.baseForCca === null || line.baseForCca === undefined
          ? null
          : round(Number(line.baseForCca)),
      ccaAmount:
        line.ccaAmount === null || line.ccaAmount === undefined
          ? null
          : round(Number(line.ccaAmount)),
      closingBalance:
        line.closingBalance === null || line.closingBalance === undefined
          ? null
          : round(Number(line.closingBalance))
    })),
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
  const rawComputed = statement.computed as unknown as Partial<RentalTaxComputedData>;
  const computed: RentalTaxComputedData = {
    grossRents: rawComputed?.grossRents ?? 0,
    otherIncome: rawComputed?.otherIncome ?? 0,
    totalIncome: rawComputed?.totalIncome ?? 0,
    expenses: rawComputed?.expenses ?? [],
    totalExpenses: rawComputed?.totalExpenses ?? 0,
    netIncome: rawComputed?.netIncome ?? 0,
    mortgageInterest: rawComputed?.mortgageInterest ?? 0,
    capitalCostAllowance: rawComputed?.capitalCostAllowance ?? 0,
    incomeDetails: rawComputed?.incomeDetails ?? [],
    ccaDetails: rawComputed?.ccaDetails ?? []
  };

  return {
    id: statement.id,
    formType: statement.formType,
    taxYear: statement.taxYear,
    propertyId: statement.propertyId ?? null,
    propertyName: statement.property?.name ?? null,
    propertyAddress: statement.property?.address ?? null,
    payload: statement.payload as unknown as RentalTaxFormPayload,
    computed,
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

  const ccaDetails: RentalTaxCcaLine[] = [];

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
    const ccaResult = calculateCca(property.depreciationInfo, netIncomeBeforeCca, {
      propertyId: property.id,
      propertyName: property.name
    });
    capitalCostAllowance += ccaResult.amount;
    if (ccaResult.detail) {
      ccaDetails.push(ccaResult.detail);
    }
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
    incomeDetails: incomeDetails.sort((a, b) => a.label.localeCompare(b.label)),
    ccaDetails
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

  const basePayload = buildFormPayload({
    formType: input.formType,
    computed,
    property,
    taxYear,
    previous: previous?.payload
  });

  const payloadTemplate = ensureTotals(basePayload);

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

export async function updateRentalTaxStatement(
  userId: number,
  id: number,
  data: { propertyId?: number | null; notes?: string | null }
): Promise<RentalTaxStatementDto | null> {
  const existing = await prisma.rentalTaxStatement.findFirst({ where: { id, userId } });
  if (!existing) {
    return null;
  }
  const updated = await prisma.rentalTaxStatement.update({
    where: { id },
    data: {
      propertyId: data.propertyId === undefined ? existing.propertyId : data.propertyId,
      notes: data.notes === undefined ? existing.notes : data.notes
    },
    include: {
      property: { select: { id: true, name: true, address: true } }
    }
  });
  return serializeRentalTaxStatement(updated);
}
