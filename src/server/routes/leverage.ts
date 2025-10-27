import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { evaluateScenario, listScenarios, saveScenario } from '../services/leverageService';
import { logger } from '../lib/logger';

const leverageRouter = Router();

const dateSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value?.getTime()), { message: 'Date de début invalide.' });

const simulateSchema = z.object({
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

leverageRouter.use(authenticated);

leverageRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const scenarios = await listScenarios(req.userId!);
    res.json(scenarios);
  } catch (error) {
    next(error);
  }
});

leverageRouter.post(
  '/simulate',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = simulateSchema.parse(req.body);
      const summary = evaluateScenario({
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
        marginalTaxRate: payload.marginalTaxRate
      });

      logger.info(
        {
          userId: req.userId,
          principal: payload.principal,
          annualRate: payload.annualRate,
          expectedReturnAnnual: payload.expectedReturnAnnual,
          sourceType: payload.sourceType
        },
        'Leverage simulation executed'
      );

      let savedScenarioId: number | undefined;
      if (payload.save) {
        const saved = await saveScenario(
          {
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
            marginalTaxRate: payload.marginalTaxRate
          },
          summary
        );
        savedScenarioId = saved.id;
      }

      res.json({ summary, savedScenarioId });
    } catch (error) {
      next(error);
    }
  }
);

export { leverageRouter };
