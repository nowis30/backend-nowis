import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { authenticated, type AuthenticatedRequest } from '../middlewares/authenticated';
import { runLeverageConversation } from '../services/ai/coordinationAI';
import { logger } from '../lib/logger';
import { ingestDocument } from '../services/ai/ingest';

const aiRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const dateSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value?.getTime()), { message: 'Date de début invalide.' });

const leverageConversationSchema = z.object({
  label: z.string().trim().min(1),
  sourceType: z.enum(['HOME_EQUITY', 'RENTAL_PROPERTY', 'HELOC', 'CORPORATE_LOAN']),
  principal: z.coerce.number().positive(),
  annualRate: z.coerce.number().min(0),
  termMonths: z.coerce.number().int().positive(),
  amortizationMonths: z.coerce.number().int().positive().optional(),
  startDate: dateSchema,
  investmentVehicle: z.enum(['ETF', 'STOCK', 'REALESTATE', 'BUSINESS', 'FUND']),
  expectedReturnAnnual: z.coerce.number(),
  expectedVolatility: z.coerce.number().optional(),
  planHorizonYears: z.coerce.number().int().min(1).max(40).default(10),
  interestDeductible: z.coerce.boolean().default(false),
  marginalTaxRate: z.coerce.number().min(0).max(1).optional(),
  companyId: z.coerce.number().int().positive().optional(),
  save: z.coerce.boolean().optional()
});

aiRouter.use(authenticated);

aiRouter.post(
  '/leverage',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = leverageConversationSchema.parse(req.body);
      const result = await runLeverageConversation({
        userId: req.userId!,
        companyId: payload.companyId,
        label: payload.label,
        sourceType: payload.sourceType,
        principal: payload.principal,
        annualRate: payload.annualRate,
        termMonths: payload.termMonths,
        amortizationMonths: payload.amortizationMonths,
        startDate: payload.startDate,
        investmentVehicle: payload.investmentVehicle,
        expectedReturnAnnual: payload.expectedReturnAnnual,
        expectedVolatility: payload.expectedVolatility,
        planHorizonYears: payload.planHorizonYears,
        interestDeductible: payload.interestDeductible,
        marginalTaxRate: payload.marginalTaxRate,
        save: payload.save
      });

      logger.info(
        {
          userId: req.userId,
          principal: payload.principal,
          annualRate: payload.annualRate,
          expectedReturnAnnual: payload.expectedReturnAnnual,
          save: payload.save ?? false
        },
        'CoordinationAI leverage conversation'
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export { aiRouter };

// --- Ingestion IA générique (mini pour extraction, modèle principal pour revue) ---
const ingestQuerySchema = z.object({
  domain: z.enum(['personal-income', 'property', 'company']),
  autoCreate: z
    .preprocess((v) => (typeof v === 'string' ? v.toLowerCase().trim() : v), z.enum(['true', 'false']).optional())
    .optional(),
  shareholderId: z.coerce.number().int().positive().optional(),
  taxYear: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1).optional()
});

aiRouter.post(
  '/ingest',
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Fichier requis (PDF ou image) sous le champ "file".' });
      }

      const { domain, autoCreate, shareholderId, taxYear } = ingestQuerySchema.parse(req.query);
      const shouldCreate = (autoCreate ?? 'false') === 'true';

      if (domain !== 'personal-income') {
        return res.status(501).json({
          error:
            "Ingestion disponible pour le moment pour 'personal-income' seulement. Les domaines 'property' et 'company' arrivent bientôt."
        });
      }

      const result = await ingestDocument({
        userId: req.userId!,
        domain,
        file: { buffer: req.file.buffer, contentType: req.file.mimetype, filename: req.file.originalname },
        options: { autoCreate: shouldCreate, shareholderId: shareholderId ?? undefined, taxYear: taxYear ?? undefined }
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);
