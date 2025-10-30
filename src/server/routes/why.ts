import { Router, NextFunction, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const whyRouter = Router();

whyRouter.use(authenticated);

const qSchema = z.object({
  shareholderId: z.coerce.number().int().positive(),
  taxYear: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1)
});

whyRouter.get('/personal-income', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { shareholderId, taxYear } = qSchema.parse(req.query);
    const shareholder = await prisma.shareholder.findFirst({ where: { id: shareholderId, userId: req.userId }, select: { id: true, displayName: true } });
    if (!shareholder) return res.status(404).json({ error: 'Actionnaire introuvable.' });

    const incomes = await prisma.personalIncome.findMany({
      where: { shareholderId, taxYear },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });
    const totalIncome = incomes.reduce((s, r) => s + Number(r.amount || 0), 0);

    const ret = await prisma.personalTaxReturn.findFirst({ where: { shareholderId, taxYear } });
    let retLines: any[] = [];
    let retSlips: any[] = [];
    if (ret) {
      retLines = await (prisma as any).personalTaxReturnLine.findMany({ where: { returnId: ret.id }, orderBy: [{ section: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }] });
      retSlips = await (prisma as any).taxSlip.findMany({ where: { returnId: ret.id }, orderBy: [{ id: 'asc' }], include: { lines: true } });
    }

    // Journal: récupérer les écritures de l'année pour l'utilisateur
    const start = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const end = new Date(`${taxYear}-12-31T23:59:59.999Z`);
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.userId!, entryDate: { gte: start, lte: end } },
      orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
      select: { id: true, entryDate: true, description: true, reference: true }
    });
    const linesByEntry: Record<number, any[]> = {};
    for (const e of entries) {
      linesByEntry[e.id] = await prisma.journalEntryLine.findMany({ where: { entryId: e.id }, orderBy: [{ id: 'asc' }] });
    }

    res.json({
      shareholder,
      taxYear,
      totalIncome,
      items: incomes.map((r) => ({ id: r.id, category: r.category, label: r.label, amount: Number(r.amount || 0), source: r.source, slipType: r.slipType })),
      taxReturn: ret
        ? {
            id: ret.id,
            taxableIncome: Number(ret.taxableIncome || 0),
            federalTax: Number(ret.federalTax || 0),
            provincialTax: Number(ret.provincialTax || 0),
            balanceDue: Number(ret.balanceDue || 0),
            lines: retLines.map((l: any) => ({ id: l.id, section: l.section, code: l.code ?? null, label: l.label, amount: Number(l.amount || 0), orderIndex: l.orderIndex || 0 })),
            slips: retSlips.map((s: any) => ({ id: s.id, slipType: s.slipType, issuer: s.issuer ?? null, accountNumber: s.accountNumber ?? null, lines: (s.lines || []).map((li: any) => ({ id: li.id, code: li.code ?? null, label: li.label, amount: Number(li.amount || 0), orderIndex: li.orderIndex || 0 })) }))
          }
        : null,
      journal: {
        entries: entries.map((e) => ({ id: e.id, entryDate: e.entryDate.toISOString(), description: e.description ?? null, reference: e.reference ?? null, lines: (linesByEntry[e.id] || []).map((l: any) => ({ id: l.id, accountCode: l.accountCode, debit: Number(l.debit || 0), credit: Number(l.credit || 0), memo: l.memo ?? null })) }))
      }
    });
  } catch (error) {
    next(error);
  }
});

export { whyRouter };
