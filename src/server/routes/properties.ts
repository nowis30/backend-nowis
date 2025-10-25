import fs from 'fs';

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  calculateScheduledPayment,
  buildAmortizationSchedule
} from '../services/amortization';
import {
  saveAttachmentFile,
  deleteAttachmentFile,
  resolveAttachmentPath
} from '../services/attachmentStorage';
import { env } from '../env';
import { extractExpenseFromAttachment } from '../services/attachmentsExtractor';

type DecimalLike = unknown;

const propertiesRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB par fichier
  }
});

const optionalNumber = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? numeric : undefined;
}, z.number().optional());

const optionalDate = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}, z.date().optional());

const optionalTrimmedString = z
  .preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }

    return value;
  }, z.string().trim().max(255))
  .optional();

const propertyBodySchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  acquisitionDate: optionalDate,
  purchasePrice: optionalNumber,
  currentValue: optionalNumber,
  notes: z.string().optional()
});

const idParamSchema = z.object({ id: z.coerce.number() });

const nonNegativeNumber = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return 0;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Math.max(0, Number(numeric)) : 0;
}, z.number().nonnegative());

const depreciationBodySchema = z.object({
  classCode: z.string().min(1),
  ccaRate: nonNegativeNumber,
  openingUcc: nonNegativeNumber,
  additions: nonNegativeNumber,
  dispositions: nonNegativeNumber
});

const optionalNonNegativeNumber = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Math.max(0, Number(numeric)) : undefined;
}, z.number().nonnegative().optional());

const positiveNumber = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Math.max(0, Number(numeric)) : undefined;
}, z.number().positive());

const boundedRate = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Number(numeric) : undefined;
}, z.number().min(0).max(1));

const positiveInt = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Number(numeric) : undefined;
}, z.number().int().positive());

const requiredDate = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return value;
}, z.date());

const propertyUnitBodySchema = z.object({
  label: z.string().trim().min(1),
  squareFeet: optionalNonNegativeNumber,
  rentExpected: optionalNonNegativeNumber
});

const propertyUnitParamsSchema = z.object({
  id: z.coerce.number(),
  unitId: z.coerce.number()
});

const mortgageInputSchema = z.object({
  lender: z.string().trim().min(1),
  principal: positiveNumber,
  rateAnnual: boundedRate,
  termMonths: positiveInt,
  amortizationMonths: positiveInt,
  startDate: requiredDate,
  paymentFrequency: positiveInt
});

const mortgageBodySchema = mortgageInputSchema;

const mortgagePreviewSchema = mortgageInputSchema.extend({
  lender: mortgageInputSchema.shape.lender.optional()
});

const attachmentMetadataSchema = z.object({
  title: optionalTrimmedString,
  mortgageId: z
    .preprocess((value) => {
      if (value === '' || value === null || value === undefined) {
        return undefined;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }, positiveInt.optional())
});

const attachmentParamsSchema = z.object({
  id: z.coerce.number(),
  attachmentId: z.coerce.number()
});

const attachmentQuerySchema = z.object({
  mortgageId: z
    .preprocess((value) => {
      if (value === '' || value === null || value === undefined) {
        return undefined;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }, positiveInt.optional())
});

const mortgageParamsSchema = z.object({
  id: z.coerce.number(),
  mortgageId: z.coerce.number()
});

interface PropertyUnitRecord {
  id: number;
  propertyId: number;
  label: string;
  squareFeet: number | null;
  rentExpected: DecimalLike | null;
}

interface MortgageRecord {
  id: number;
  propertyId: number;
  lender: string;
  principal: DecimalLike;
  rateAnnual: DecimalLike;
  termMonths: number;
  amortizationMonths: number;
  startDate: Date;
  paymentFrequency: number;
  paymentAmount: DecimalLike;
  createdAt: Date;
  updatedAt: Date;
}

interface AttachmentRecord {
  id: number;
  propertyId: number;
  mortgageId: number | null;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  checksum: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeUnit(unit: PropertyUnitRecord) {
  return {
    id: unit.id,
    propertyId: unit.propertyId,
    label: unit.label,
    squareFeet: unit.squareFeet === null ? null : Number(unit.squareFeet),
    rentExpected: unit.rentExpected === null ? null : Number(unit.rentExpected ?? 0)
  };
}

function serializeMortgage(mortgage: MortgageRecord) {
  return {
    id: mortgage.id,
    propertyId: mortgage.propertyId,
    lender: mortgage.lender,
    principal: Number(mortgage.principal ?? 0),
    rateAnnual: Number(mortgage.rateAnnual ?? 0),
    termMonths: mortgage.termMonths,
    amortizationMonths: mortgage.amortizationMonths,
    startDate: mortgage.startDate.toISOString(),
    paymentFrequency: mortgage.paymentFrequency,
    paymentAmount: Number(mortgage.paymentAmount ?? 0),
    createdAt: mortgage.createdAt.toISOString(),
    updatedAt: mortgage.updatedAt.toISOString()
  };
}

function serializeAttachment(attachment: AttachmentRecord) {
  return {
    id: attachment.id,
    propertyId: attachment.propertyId,
    mortgageId: attachment.mortgageId,
    title: attachment.title,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    checksum: attachment.checksum,
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString()
  };
}

propertiesRouter.use(authenticated);

propertiesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const properties = await prisma.property.findMany({
      where: { userId: req.userId },
      include: {
        mortgages: true,
        revenues: true,
        expenses: true
      }
    });
    res.json(properties);
  } catch (error) {
    next(error);
  }
});

propertiesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = propertyBodySchema.parse(req.body);
    const property = await prisma.property.create({
      data: {
        userId: req.userId!,
        name: data.name,
        address: data.address,
        acquisitionDate: data.acquisitionDate,
        purchasePrice: data.purchasePrice,
        currentValue: data.currentValue,
        notes: data.notes
      }
    });
    res.status(201).json(property);
  } catch (error) {
    next(error);
  }
});

propertiesRouter.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = propertyBodySchema.parse(req.body);

    const existing = await prisma.property.findFirst({ where: { id, userId: req.userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Immeuble introuvable.' });
    }

    const property = await prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        acquisitionDate: data.acquisitionDate,
        purchasePrice: data.purchasePrice,
        currentValue: data.currentValue,
        notes: data.notes
      }
    });

    res.json(property);
  } catch (error) {
    next(error);
  }
});

propertiesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    await prisma.property.deleteMany({ where: { id, userId: req.userId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

propertiesRouter.get(
  '/:id/units',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const units = (await prisma.propertyUnit.findMany({
        where: { propertyId: id },
        orderBy: [{ label: 'asc' }, { id: 'asc' }]
      })) as PropertyUnitRecord[];

      res.json(units.map(serializeUnit));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.post(
  '/:id/units',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = propertyUnitBodySchema.parse(req.body);

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const unit = (await prisma.propertyUnit.create({
        data: {
          propertyId: id,
          label: data.label,
          squareFeet: data.squareFeet ?? null,
          rentExpected: data.rentExpected ?? null
        }
      })) as PropertyUnitRecord;

      res.status(201).json(serializeUnit(unit));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.put(
  '/:id/units/:unitId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, unitId } = propertyUnitParamsSchema.parse(req.params);
      const data = propertyUnitBodySchema.parse(req.body);

      const existing = await prisma.propertyUnit.findFirst({
        where: { id: unitId, propertyId: id, property: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Unité introuvable.' });
      }

      const unit = (await prisma.propertyUnit.update({
        where: { id: unitId },
        data: {
          label: data.label,
          squareFeet: data.squareFeet ?? null,
          rentExpected: data.rentExpected ?? null
        }
      })) as PropertyUnitRecord;

      res.json(serializeUnit(unit));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.delete(
  '/:id/units/:unitId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, unitId } = propertyUnitParamsSchema.parse(req.params);

      const deleted = await prisma.propertyUnit.deleteMany({
        where: { id: unitId, propertyId: id, property: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Unité introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.get(
  '/:id/mortgages',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const mortgages = (await prisma.mortgage.findMany({
        where: { propertyId: id },
        orderBy: [{ createdAt: 'desc' }]
      })) as MortgageRecord[];

      res.json(mortgages.map(serializeMortgage));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.post(
  '/:id/mortgages/preview',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = mortgagePreviewSchema.parse(req.body);

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const analysis = buildAmortizationSchedule({
        principal: data.principal,
        rateAnnual: data.rateAnnual,
        amortizationMonths: data.amortizationMonths,
        paymentFrequency: data.paymentFrequency,
        startDate: data.startDate,
        termMonths: data.termMonths,
        paymentAmount: undefined
      });

      res.json(analysis);
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.get(
  '/:id/attachments',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const query = attachmentQuerySchema.parse(req.query);

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const attachments = (await prisma.attachment.findMany({
        where: {
          propertyId: id,
          mortgageId: query.mortgageId ?? undefined
        },
        orderBy: [{ createdAt: 'desc' }]
      })) as AttachmentRecord[];

      res.json(attachments.map(serializeAttachment));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.post(
  '/:id/attachments',
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const metadata = attachmentMetadataSchema.parse(req.body ?? {});

      if (!req.file) {
        return res.status(400).json({ error: 'Fichier requis.' });
      }

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      let mortgageId: number | undefined;

      if (metadata.mortgageId !== undefined) {
        const mortgage = await prisma.mortgage.findFirst({
          where: { id: metadata.mortgageId, propertyId: id }
        });

        if (!mortgage) {
          return res.status(404).json({ error: "Hypothèque introuvable pour cet immeuble." });
        }

        mortgageId = mortgage.id;
      }

      const title = metadata.title ?? req.file.originalname;

      let storagePath = '';
      let checksum = '';
      let filename = '';

      try {
        const saved = await saveAttachmentFile({
          buffer: req.file.buffer,
          propertyId: id,
          originalName: req.file.originalname
        });
        storagePath = saved.storagePath;
        checksum = saved.checksum;
        filename = saved.filename;
      } catch (error) {
        return next(error);
      }

      try {
        const attachment = (await prisma.attachment.create({
          data: {
            propertyId: id,
            mortgageId: mortgageId ?? null,
            title,
            filename,
            contentType: req.file.mimetype,
            size: req.file.size,
            storagePath,
            checksum
          }
        })) as AttachmentRecord;

        res.status(201).json(serializeAttachment(attachment));
      } catch (error) {
        await deleteAttachmentFile(storagePath);
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.post(
  '/:id/mortgages',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = mortgageBodySchema.parse(req.body);
      const paymentAmount = calculateScheduledPayment({
        principal: data.principal,
        rateAnnual: data.rateAnnual,
        amortizationMonths: data.amortizationMonths,
        paymentFrequency: data.paymentFrequency
      });

      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        select: { id: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const mortgage = (await prisma.mortgage.create({
        data: {
          propertyId: id,
          lender: data.lender,
          principal: data.principal,
          rateAnnual: data.rateAnnual,
          termMonths: data.termMonths,
          amortizationMonths: data.amortizationMonths,
          startDate: data.startDate,
          paymentFrequency: data.paymentFrequency,
          paymentAmount
        }
      })) as MortgageRecord;

      res.status(201).json(serializeMortgage(mortgage));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.put(
  '/:id/mortgages/:mortgageId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, mortgageId } = mortgageParamsSchema.parse(req.params);
      const data = mortgageBodySchema.parse(req.body);
      const paymentAmount = calculateScheduledPayment({
        principal: data.principal,
        rateAnnual: data.rateAnnual,
        amortizationMonths: data.amortizationMonths,
        paymentFrequency: data.paymentFrequency
      });

      const existing = await prisma.mortgage.findFirst({
        where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Hypothèque introuvable.' });
      }

      const mortgage = (await prisma.mortgage.update({
        where: { id: mortgageId },
        data: {
          lender: data.lender,
          principal: data.principal,
          rateAnnual: data.rateAnnual,
          termMonths: data.termMonths,
          amortizationMonths: data.amortizationMonths,
          startDate: data.startDate,
          paymentFrequency: data.paymentFrequency,
          paymentAmount
        }
      })) as MortgageRecord;

      res.json(serializeMortgage(mortgage));
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.get(
  '/:id/attachments/:attachmentId/download',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, attachmentId } = attachmentParamsSchema.parse(req.params);

      const attachment = (await prisma.attachment.findFirst({
        where: {
          id: attachmentId,
          propertyId: id,
          property: { userId: req.userId }
        }
      })) as AttachmentRecord | null;

      if (!attachment) {
        return res.status(404).json({ error: 'Pièce jointe introuvable.' });
      }

      const filePath = resolveAttachmentPath(attachment.storagePath);

      try {
        await fs.promises.access(filePath);
      } catch {
        return res.status(410).json({ error: 'Fichier indisponible.' });
      }

      res.setHeader('Content-Type', attachment.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.filename)}"`
      );

      const stream = fs.createReadStream(filePath);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.post(
  '/:id/attachments/:attachmentId/extract',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, attachmentId } = attachmentParamsSchema.parse(req.params);

      const attachment = (await prisma.attachment.findFirst({
        where: {
          id: attachmentId,
          propertyId: id,
          property: { userId: req.userId }
        }
      })) as AttachmentRecord | null;

      if (!attachment) {
        return res.status(404).json({ error: 'Pièce jointe introuvable.' });
      }

      if (!env.OPENAI_API_KEY) {
        return res
          .status(503)
          .json({ error: 'Extraction indisponible: configurez OPENAI_API_KEY côté serveur.' });
      }

      const ct = attachment.contentType || 'application/octet-stream';
      if (!/^image\//i.test(ct) && !/^application\/(pdf|x-pdf)$/i.test(ct)) {
        return res
          .status(415)
          .json({ error: "Type non supporté pour l'extraction (images ou PDF uniquement)." });
      }

      const result = await extractExpenseFromAttachment(attachment.storagePath, ct);

      const autoCreateRaw = Array.isArray(req.query.autoCreate)
        ? req.query.autoCreate[0]
        : req.query.autoCreate;
      const normalizedFlag = typeof autoCreateRaw === 'string'
        ? autoCreateRaw.toLowerCase().trim()
        : '';
      const shouldCreate = ['1', 'true', 'yes'].includes(normalizedFlag);

      let createdExpenseId: number | null = null;
      if (
        shouldCreate &&
        result.label &&
        result.amount > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(result.startDate)
      ) {
        const createdExpense = await prisma.expense.create({
          data: {
            propertyId: id,
            label: result.label,
            category: result.category || 'Autre',
            amount: result.amount,
            frequency: 'PONCTUEL',
            startDate: new Date(result.startDate),
            endDate: null
          }
        });
        createdExpenseId = createdExpense.id;
      }

      res.json({ extracted: result, createdExpenseId });
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.get(
  '/:id/mortgages/:mortgageId/amortization',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, mortgageId } = mortgageParamsSchema.parse(req.params);

      const mortgage = await prisma.mortgage.findFirst({
        where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
      });

      if (!mortgage) {
        return res.status(404).json({ error: 'Hypothèque introuvable.' });
      }

      const analysis = buildAmortizationSchedule({
        principal: mortgage.principal,
        rateAnnual: mortgage.rateAnnual,
        amortizationMonths: mortgage.amortizationMonths,
        paymentFrequency: mortgage.paymentFrequency,
        startDate: mortgage.startDate,
        termMonths: mortgage.termMonths,
        paymentAmount: mortgage.paymentAmount
      });

      res.json({
        mortgage: serializeMortgage(mortgage as MortgageRecord),
        analysis
      });
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.delete(
  '/:id/mortgages/:mortgageId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, mortgageId } = mortgageParamsSchema.parse(req.params);

      const deleted = await prisma.mortgage.deleteMany({
        where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Hypothèque introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.delete(
  '/:id/attachments/:attachmentId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, attachmentId } = attachmentParamsSchema.parse(req.params);

      const attachment = (await prisma.attachment.findFirst({
        where: {
          id: attachmentId,
          propertyId: id,
          property: { userId: req.userId }
        }
      })) as AttachmentRecord | null;

      if (!attachment) {
        return res.status(404).json({ error: 'Pièce jointe introuvable.' });
      }

      await prisma.attachment.delete({ where: { id: attachment.id } });
      await deleteAttachmentFile(attachment.storagePath);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.get(
  '/:id/depreciation',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const property = await prisma.property.findFirst({
        where: { id, userId: req.userId },
        include: { depreciationInfo: true }
      });

      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      if (!property.depreciationInfo) {
        return res.json({
          classCode: '',
          ccaRate: 0,
          openingUcc: 0,
          additions: 0,
          dispositions: 0
        });
      }

      const { classCode, ccaRate, openingUcc, additions, dispositions } = property.depreciationInfo;
      res.json({
        classCode,
        ccaRate: Number(ccaRate ?? 0),
        openingUcc: Number(openingUcc ?? 0),
        additions: Number(additions ?? 0),
        dispositions: Number(dispositions ?? 0)
      });
    } catch (error) {
      next(error);
    }
  }
);

propertiesRouter.put(
  '/:id/depreciation',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = depreciationBodySchema.parse(req.body);

      const property = await prisma.property.findFirst({ where: { id, userId: req.userId } });
      if (!property) {
        return res.status(404).json({ error: 'Immeuble introuvable.' });
      }

      const depreciation = await prisma.depreciationSetting.upsert({
        where: { propertyId: id },
        update: {
          classCode: data.classCode,
          ccaRate: data.ccaRate,
          openingUcc: data.openingUcc,
          additions: data.additions,
          dispositions: data.dispositions
        },
        create: {
          propertyId: id,
          classCode: data.classCode,
          ccaRate: data.ccaRate,
          openingUcc: data.openingUcc,
          additions: data.additions,
          dispositions: data.dispositions
        }
      });

      res.json({
        classCode: depreciation.classCode,
        ccaRate: Number(depreciation.ccaRate ?? 0),
        openingUcc: Number(depreciation.openingUcc ?? 0),
        additions: Number(depreciation.additions ?? 0),
        dispositions: Number(depreciation.dispositions ?? 0)
      });
    } catch (error) {
      next(error);
    }
  }
);

export { propertiesRouter };
