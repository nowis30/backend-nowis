import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  PERSONAL_INCOME_CATEGORIES,
  type PersonalIncomeCategory,
  getPersonalIncomeSummary
} from '../services/personalIncomeService';

type DecimalLike = unknown;

type PersonalIncomeWithShareholder = {
  id: number;
  shareholderId: number;
  taxYear: number;
  category: PersonalIncomeCategory;
  label: string;
  source: string | null;
  slipType: string | null;
  amount: DecimalLike;
  createdAt: Date;
  updatedAt: Date;
  shareholder: {
    id: number;
    displayName: string;
  };
};

const personalIncomesRouter = Router();

const taxYearSchema = z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1);

const optionalTrimmedString = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const stringValue = String(value).trim();
    return stringValue.length > 0 ? stringValue : undefined;
  }, z.string().max(255))
  .optional();

const categoryEnum = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.enum(PERSONAL_INCOME_CATEGORIES));

const personalIncomeBodySchema = z.object({
  shareholderId: z.coerce.number().int().positive(),
  taxYear: taxYearSchema,
  category: categoryEnum,
  label: z.string().trim().min(1),
  source: optionalTrimmedString,
  slipType: optionalTrimmedString,
  amount: z.coerce.number().gt(0)
});

const listQuerySchema = z.object({
  shareholderId: z.coerce.number().int().positive().optional(),
  taxYear: taxYearSchema.optional()
});

const summaryQuerySchema = z.object({
  shareholderId: z.coerce.number().int().positive(),
  taxYear: taxYearSchema
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

function serialize(record: PersonalIncomeWithShareholder) {
  return {
    id: record.id,
    shareholderId: record.shareholderId,
    taxYear: record.taxYear,
    category: record.category,
    label: record.label,
    source: record.source,
    slipType: record.slipType,
    amount: Number(record.amount ?? 0),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    shareholder: record.shareholder
  };
}

async function ensureShareholderOwnership(userId: number, shareholderId: number) {
  const shareholder = await prisma.shareholder.findFirst({
    where: { id: shareholderId, userId },
    select: { id: true, displayName: true }
  });

  return shareholder;
}

personalIncomesRouter.use(authenticated);

personalIncomesRouter.get(
  '/shareholders',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let shareholders = await prisma.shareholder.findMany({
        where: { userId: req.userId },
        select: { id: true, displayName: true },
        orderBy: [{ displayName: 'asc' }]
      });

      if (shareholders.length === 0) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId! },
          select: { email: true }
        });

        const createdShareholder = await prisma.shareholder.create({
          data: {
            userId: req.userId!,
            displayName: 'Profil personnel',
            contactEmail: user?.email ?? null
          },
          select: { id: true, displayName: true }
        });

        shareholders = [createdShareholder];
      }

      res.json(shareholders);
    } catch (error) {
      next(error);
    }
  }
);

personalIncomesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { shareholderId, taxYear } = listQuerySchema.parse(req.query);

    // Ensure access when filtering by shareholder
    if (shareholderId) {
      const shareholder = await ensureShareholderOwnership(req.userId!, shareholderId);
      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }
    }

  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
    const incomes = (await prisma.personalIncome.findMany({
      where: {
        shareholder: { userId: req.userId },
        ...(shareholderId ? { shareholderId } : {}),
        ...(taxYear ? { taxYear } : {})
      },
      include: {
        shareholder: { select: { id: true, displayName: true } }
      },
      orderBy: [{ taxYear: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }]
    })) as PersonalIncomeWithShareholder[];

    res.json(incomes.map(serialize));
  } catch (error) {
    next(error);
  }
});

personalIncomesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = personalIncomeBodySchema.parse(req.body);

    const shareholder = await ensureShareholderOwnership(req.userId!, payload.shareholderId);
    if (!shareholder) {
      return res.status(404).json({ error: 'Actionnaire introuvable.' });
    }

  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
    const created = (await prisma.personalIncome.create({
      data: {
        shareholderId: payload.shareholderId,
        taxYear: payload.taxYear,
        category: payload.category,
        label: payload.label,
        source: payload.source ?? null,
        slipType: payload.slipType ?? null,
        amount: payload.amount
      },
      include: {
        shareholder: { select: { id: true, displayName: true } }
      }
    })) as PersonalIncomeWithShareholder;

    res.status(201).json(serialize(created));
  } catch (error) {
    next(error);
  }
});

personalIncomesRouter.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const payload = personalIncomeBodySchema.parse(req.body);

      const shareholder = await ensureShareholderOwnership(req.userId!, payload.shareholderId);
      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }

  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
      const existing = await prisma.personalIncome.findFirst({
        where: { id, shareholder: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Revenu personnel introuvable.' });
      }

  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
      const updated = (await prisma.personalIncome.update({
        where: { id },
        data: {
          shareholderId: payload.shareholderId,
          taxYear: payload.taxYear,
          category: payload.category,
          label: payload.label,
          source: payload.source ?? null,
          slipType: payload.slipType ?? null,
          amount: payload.amount
        },
        include: {
          shareholder: { select: { id: true, displayName: true } }
        }
      })) as PersonalIncomeWithShareholder;

      res.json(serialize(updated));
    } catch (error) {
      next(error);
    }
  }
);

personalIncomesRouter.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

  // @ts-ignore -- Prisma client will expose personalIncome after generating the new schema
      const deleted = await prisma.personalIncome.deleteMany({
        where: { id, shareholder: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Revenu personnel introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

personalIncomesRouter.get(
  '/summary',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { shareholderId, taxYear } = summaryQuerySchema.parse(req.query);

      const shareholder = await ensureShareholderOwnership(req.userId!, shareholderId);
      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }

      const summary = await getPersonalIncomeSummary(shareholderId, taxYear);
      res.json({
        shareholder,
        taxYear,
        categories: summary.totalsByCategory,
        taxInputs: summary.totalsForTax,
        totalIncome: summary.totalIncome
      });
    } catch (error) {
      next(error);
    }
  }
);

export { personalIncomesRouter };
