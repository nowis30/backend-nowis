import { PERSONAL_INCOME_CATEGORIES } from '../../services/personalIncomeService';

export type JournalLineDraft = {
  accountCode: string;
  debit: number; // >= 0
  credit: number; // >= 0
  memo?: string;
};

export type JournalDraft = {
  userId: number;
  entryDate: Date;
  description?: string;
  reference?: string;
  lines: JournalLineDraft[]; // must balance (sum debit == sum credit)
};

type PersonalIncomeItem = {
  category: string;
  label: string;
  amount: number;
  source?: string | null;
  slipType?: string | null;
};

const DEFAULT_DEBIT_CASH = '1100'; // Trésorerie (seed)
const DEFAULT_REV_ACCT = '4200'; // Autres revenus (seed)
// Comptes revenus enrichis (voir seed)
const REV_ACCOUNTS: Record<string, string> = {
  EMPLOYMENT: '4110',
  BUSINESS: '4115',
  ELIGIBLE_DIVIDEND: '4120',
  NON_ELIGIBLE_DIVIDEND: '4121',
  CAPITAL_GAIN: '4130',
  PENSION: '4140',
  OAS: '4150',
  CPP_QPP: '4151',
  RRIF_RRSP: '4160'
};

function mapCategoryToRevenueAccount(category: string, customMap?: Record<string, string>): string {
  const upper = String(category || '').trim().toUpperCase();
  if (customMap && customMap[upper]) return customMap[upper];

  // Minimal mapping using seeded accounts
  switch (upper as (typeof PERSONAL_INCOME_CATEGORIES)[number]) {
    case 'EMPLOYMENT':
    case 'BUSINESS':
    case 'ELIGIBLE_DIVIDEND':
    case 'NON_ELIGIBLE_DIVIDEND':
    case 'CAPITAL_GAIN':
    case 'PENSION':
    case 'OAS':
    case 'CPP_QPP':
    case 'RRIF_RRSP':
      return REV_ACCOUNTS[upper] || DEFAULT_REV_ACCT;
    case 'OTHER':
      return DEFAULT_REV_ACCT;
    default:
      return DEFAULT_REV_ACCT;
  }
}

export function transformPersonalIncomeItemsToJournalDrafts(params: {
  userId: number;
  taxYear: number;
  items: PersonalIncomeItem[];
  defaultDebitAccountCode?: string; // e.g., '1100' cash or '1200' receivable
  revenueAccountMap?: Record<string, string>; // override per category
}): JournalDraft[] {
  const { userId, taxYear, items, defaultDebitAccountCode, revenueAccountMap } = params;
  const entryDate = new Date(`${taxYear}-12-31T23:59:59.000Z`);
  const debitAcct = defaultDebitAccountCode || DEFAULT_DEBIT_CASH;

  const drafts: JournalDraft[] = [];
  for (const it of items) {
    const amt = Number(it.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const creditAcct = mapCategoryToRevenueAccount(it.category, revenueAccountMap);
    const memo = [it.slipType, it.source, it.label].filter(Boolean).join(' – ');

    drafts.push({
      userId,
      entryDate,
      description: it.label,
      reference: it.slipType || undefined,
      lines: [
        { accountCode: debitAcct, debit: amt, credit: 0, memo },
        { accountCode: creditAcct, debit: 0, credit: amt, memo }
      ]
    });
  }
  return drafts;
}
