import { prisma } from '../../lib/prisma';

export type JournalLineDraft = {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type JournalDraft = {
  userId: number;
  entryDate: Date;
  description?: string;
  reference?: string;
  lines: JournalLineDraft[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateBalanced(lines: JournalLineDraft[]): void {
  const totals = lines.reduce(
    (acc, l) => {
      acc.debit += Number(l.debit || 0);
      acc.credit += Number(l.credit || 0);
      return acc;
    },
    { debit: 0, credit: 0 }
  );
  if (round2(totals.debit) !== round2(totals.credit)) {
    throw new Error(`Unbalanced journal: debit=${round2(totals.debit)} credit=${round2(totals.credit)}`);
  }
}

export async function postJournalDrafts(drafts: JournalDraft[]): Promise<{ entryIds: number[] }>
{
  const entryIds: number[] = [];
  for (const d of drafts) {
    validateBalanced(d.lines);
    const entry = await prisma.journalEntry.create({
      data: {
        userId: d.userId,
        entryDate: d.entryDate,
        description: d.description ?? null,
        reference: d.reference ?? null
      },
      select: { id: true }
    });
    for (const l of d.lines) {
      await prisma.journalEntryLine.create({
        data: {
          entryId: entry.id,
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo ?? null
        }
      });
    }
    entryIds.push(entry.id);
  }
  return { entryIds };
}
