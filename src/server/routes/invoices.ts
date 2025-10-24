import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

const invoicesRouter = Router();

const dateFromInput = z.preprocess((value) => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().length === 10 ? `${value}T00:00:00.000Z` : value;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}, z.date());

const invoiceBodySchema = z.object({
  propertyId: z.number(),
  invoiceDate: dateFromInput,
  supplier: z.string().min(1),
  amount: z.number(),
  category: z.string().min(1),
  gst: z.number().optional(),
  qst: z.number().optional(),
  description: z.string().optional()
});

const idParamSchema = z.object({ id: z.coerce.number() });

invoicesRouter.use(authenticated);

invoicesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : undefined;
    const filters = propertyId
      ? { propertyId, property: { userId: req.userId } }
      : { property: { userId: req.userId } };

    const invoices = await prisma.invoice.findMany({
      where: filters,
      include: { property: { select: { name: true } }, items: true }
    });
    res.json(invoices);
  } catch (error) {
    next(error);
  }
});

invoicesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = invoiceBodySchema.parse(req.body);
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, userId: req.userId }
    });

    if (!property) {
      return res.status(404).json({ error: 'Immeuble introuvable.' });
    }

    const invoice = await prisma.invoice.create({
      data: {
        propertyId: data.propertyId,
  invoiceDate: data.invoiceDate,
        supplier: data.supplier,
        amount: data.amount,
        category: data.category,
        gst: data.gst,
        qst: data.qst,
        description: data.description
      }
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

invoicesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    await prisma.invoice.deleteMany({
      where: { id, property: { userId: req.userId } }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { invoicesRouter };
