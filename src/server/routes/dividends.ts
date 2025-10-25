import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';
import { recordDividend, recordReturnOfCapital, listDividendsForUser, listReturnOfCapital } from '../services/tax/dividendsService';

const router = Router();

router.use(authenticated);
router.use(requireRole('ADMIN'));

const dividendSchema = z.object({
  companyId: z.number().int().positive(),
  shareholderId: z.number().int().positive(),
  shareClassId: z.number().int().positive().optional(),
  declarationDate: z.string().datetime(),
  recordDate: z.string().datetime().optional(),
  paymentDate: z.string().datetime().optional(),
  amount: z.number().positive(),
  dividendType: z.enum(['ELIGIBLE', 'NON_ELIGIBLE']),
  notes: z.string().max(4000).optional()
});

router.post('/dividends', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = dividendSchema.parse(req.body);

    const company = await prisma.company.findFirst({ where: { id: payload.companyId, userId: req.userId! } });
    if (!company) {
      return res.status(404).json({ message: 'Société introuvable' });
    }

    const record = await recordDividend({
      companyId: payload.companyId,
      shareholderId: payload.shareholderId,
      shareClassId: payload.shareClassId ?? null,
      declarationDate: new Date(payload.declarationDate),
      recordDate: payload.recordDate ? new Date(payload.recordDate) : null,
      paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : null,
      amount: payload.amount,
      dividendType: payload.dividendType,
      notes: payload.notes ?? null
    });

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.get('/dividends', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const dividends = await listDividendsForUser(req.userId!, year);
    res.json(dividends);
  } catch (error) {
    next(error);
  }
});

const rocSchema = z.object({
  companyId: z.number().int().positive(),
  shareholderId: z.number().int().positive(),
  shareClassId: z.number().int().positive().optional(),
  transactionDate: z.string().datetime(),
  amount: z.number().positive(),
  notes: z.string().max(4000).optional()
});

router.post('/returns-of-capital', async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = rocSchema.parse(req.body);

    const company = await prisma.company.findFirst({ where: { id: payload.companyId, userId: req.userId! } });
    if (!company) {
      return res.status(404).json({ message: 'Société introuvable' });
    }

    const record = await recordReturnOfCapital({
      companyId: payload.companyId,
      shareholderId: payload.shareholderId,
      shareClassId: payload.shareClassId ?? null,
      transactionDate: new Date(payload.transactionDate),
      amount: payload.amount,
      notes: payload.notes ?? null
    });

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.get('/returns-of-capital', async (req: AuthenticatedRequest, res, next) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const records = await listReturnOfCapital(req.userId!, year);
    res.json(records);
  } catch (error) {
    next(error);
  }
});

export const dividendsRouter = router;
