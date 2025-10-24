import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  buildExpensesFiscalReport,
  expensesFiscalReportToCsv
} from '../services/expensesFiscalReport';

type DecimalLike = unknown;

const expensesRouter = Router();

const frequencyValues = ['PONCTUEL', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'] as const;

type Frequency = (typeof frequencyValues)[number];

const optionalDate = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}, z.coerce.date().optional());

const expenseBodySchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1),
  category: z.string().trim().min(1),
  amount: z.coerce.number().gt(0),
  frequency: z
    .string()
    .min(1)
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(frequencyValues)),
  startDate: z.coerce.date(),
  endDate: optionalDate
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const fiscalExportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  format: z.enum(['json', 'csv']).optional()
});

interface ExpenseWithProperty {
  id: number;
  propertyId: number;
  label: string;
  category: string;
  amount: DecimalLike;
  frequency: Frequency;
  startDate: Date;
  endDate: Date | null;
  property: { id: number; name: string };
}

function serializeExpense(expense: ExpenseWithProperty) {
  return {
    id: expense.id,
    propertyId: expense.propertyId,
    label: expense.label,
    category: expense.category,
    amount: Number(expense.amount ?? 0),
    frequency: expense.frequency,
    startDate: expense.startDate.toISOString(),
    endDate: expense.endDate ? expense.endDate.toISOString() : null,
    property: expense.property
  };
}

expensesRouter.use(authenticated);

expensesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expenses = (await prisma.expense.findMany({
      where: { property: { userId: req.userId } },
      include: { property: { select: { id: true, name: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }]
    })) as ExpenseWithProperty[];

    res.json(expenses.map(serializeExpense));
  } catch (error) {
    next(error);
  }
});

expensesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = expenseBodySchema.parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, userId: req.userId }
    });

    if (!property) {
      return res.status(404).json({ error: "Immeuble introuvable." });
    }

    const expense = (await prisma.expense.create({
      data: {
        propertyId: data.propertyId,
        label: data.label,
        category: data.category,
        amount: data.amount,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate ?? null
      },
      include: { property: { select: { id: true, name: true } } }
    })) as ExpenseWithProperty;

    res.status(201).json(serializeExpense(expense));
  } catch (error) {
    next(error);
  }
});

expensesRouter.get(
  '/export/fiscal',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { year: parsedYear, format } = fiscalExportQuerySchema.parse(req.query);
      const year = parsedYear ?? new Date().getFullYear();

      const report = await buildExpensesFiscalReport(req.userId!, year);

      if (format === 'csv') {
        const csv = expensesFiscalReportToCsv(report);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="nowis-depenses-fiscales-${year}.csv"`);
        res.send(`\uFEFF${csv}`);
        return;
      }

      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

expensesRouter.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = expenseBodySchema.parse(req.body);

    const existing = await prisma.expense.findFirst({
      where: { id, property: { userId: req.userId } }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }

    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, userId: req.userId }
    });

    if (!property) {
      return res.status(404).json({ error: "Immeuble introuvable." });
    }

    const expense = (await prisma.expense.update({
      where: { id },
      data: {
        propertyId: data.propertyId,
        label: data.label,
        category: data.category,
        amount: data.amount,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate ?? null
      },
      include: { property: { select: { id: true, name: true } } }
    })) as ExpenseWithProperty;

    res.json(serializeExpense(expense));
  } catch (error) {
    next(error);
  }
});

expensesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const deleted = await prisma.expense.deleteMany({
      where: { id, property: { userId: req.userId } }
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { expensesRouter };
