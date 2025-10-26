import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import {
  calculateLeveragedBuyback,
  round,
  serializeLeveragedScenario,
  LeveragedBuybackInput,
  LeveragedBuybackScenarioDto,
  buildLeveragedBuybackResolution
} from '../services/leveragedBuybackService';
import { generateLeveragedBuybackPdf } from '../services/pdfService';

const leveragedBuybackRouter = Router();

const baseInputSchema = z.object({
  loanAmount: z.coerce.number().positive(),
  interestRatePercent: z.coerce.number().min(0).max(100),
  taxRatePercent: z.coerce.number().min(0).max(100),
  expectedGrowthPercent: z.coerce.number().min(-100).max(300),
  termYears: z.coerce.number().positive()
});

const optionalText = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    return value;
  }, z.string().max(5000))
  .optional();

const optionalShortText = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    return value;
  }, z.string().max(255))
  .optional();

const simulationSchema = baseInputSchema;

const createSchema = baseInputSchema.extend({
  companyId: z.coerce.number().int().positive().optional(),
  approved: z.coerce.boolean().optional(),
  label: optionalShortText,
  notes: optionalText
});

const reportSchema = createSchema.extend({
  companyName: optionalShortText
});

leveragedBuybackRouter.use(authenticated);

leveragedBuybackRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const scenarios = await prisma.leveragedBuybackScenario.findMany({
      where: { userId: req.userId! },
      include: {
        company: {
          select: { id: true, name: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    res.json(scenarios.map(serializeLeveragedScenario));
  } catch (error) {
    next(error);
  }
});

leveragedBuybackRouter.post(
  '/simulate',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payload = simulationSchema.parse(req.body);
      const result = calculateLeveragedBuyback(payload as LeveragedBuybackInput);

      res.json(buildSimulationResponse(result));
    } catch (error) {
      next(error);
    }
  }
);

leveragedBuybackRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payload = createSchema.parse(req.body);
    const userId = req.userId!;

    let companyName: string | undefined;
    if (payload.companyId) {
      const company = await prisma.company.findFirst({
        where: { id: payload.companyId, userId }
      });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      companyName = company.name;
    }

    const result = calculateLeveragedBuyback(payload as LeveragedBuybackInput);
    const created = await prisma.leveragedBuybackScenario.create({
      data: {
        userId,
        companyId: payload.companyId ?? null,
        label: payload.label ?? null,
        notes: payload.notes ?? null,
        loanAmount: result.input.loanAmount,
        interestRate: result.input.interestRate,
        taxRate: result.input.taxRate,
        expectedGrowth: result.input.expectedGrowth,
        termMonths: result.input.termMonths,
        monthlyPayment: result.metrics.monthlyPayment,
        totalInterest: result.metrics.totalInterest,
        taxShield: result.metrics.taxShield,
        afterTaxInterest: result.metrics.afterTaxInterest,
        projectedShareValue: result.metrics.projectedShareValue,
        projectedShareGain: result.metrics.projectedShareGain,
        netGain: result.metrics.netGain,
        breakEvenGrowth: result.metrics.breakEvenGrowth,
        returnOnInvestment: result.metrics.returnOnInvestment,
        paybackYears: result.metrics.paybackYears,
        approved: payload.approved ?? false
      }
    });

    const stored = await prisma.leveragedBuybackScenario.findUnique({
      where: { id: created.id, userId },
      include: {
        company: {
          select: { id: true, name: true }
        }
      }
    });

    if (!stored) {
      return res.status(500).json({ error: 'Scénario introuvable après création.' });
    }

    const serialized = serializeLeveragedScenario(stored);

    let resolutionId: number | null = null;
    if (serialized.companyId && serialized.approved) {
      const resolution = await prisma.corporateResolution.create({
        data: {
          companyId: serialized.companyId,
          type: 'FINANCING',
          title: serialized.label
            ? `Validation – ${serialized.label}`
            : "Validation rachat d'actions refinancé",
          resolutionDate: new Date(),
          body: buildLeveragedBuybackResolution(serialized, companyName ?? serialized.companyName ?? 'La société'),
          metadata: JSON.stringify({ leveragedBuybackScenarioId: serialized.id })
        }
      });

      resolutionId = resolution.id;
    }

    res.status(201).json({ ...serialized, resolutionId });
  } catch (error) {
    next(error);
  }
});

leveragedBuybackRouter.post(
  '/report',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payload = reportSchema.parse(req.body);
      const result = calculateLeveragedBuyback(payload as LeveragedBuybackInput);
      const snapshot = buildSimulationResponse(result);
      const syntheticScenario: LeveragedBuybackScenarioDto = {
        id: 0,
        label: payload.label ?? null,
        companyId: payload.companyId ?? null,
        companyName: payload.companyName ?? null,
        approved: payload.approved ?? false,
        notes: payload.notes ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        inputs: snapshot.inputs,
        metrics: snapshot.metrics
      };

      const pdf = await generateLeveragedBuybackPdf({
        scenario: syntheticScenario,
        notes: payload.notes ?? null
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="simulation-rachat-actions.pdf"');
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }
);

leveragedBuybackRouter.get(
  '/:id/pdf',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Identifiant invalide.' });
      }

      const scenario = await prisma.leveragedBuybackScenario.findFirst({
        where: { id, userId: req.userId! },
        include: {
          company: { select: { id: true, name: true } }
        }
      });

      if (!scenario) {
        return res.status(404).json({ error: 'Scénario introuvable.' });
      }

      const serialized = serializeLeveragedScenario(scenario);
      const pdf = await generateLeveragedBuybackPdf({ scenario: serialized, notes: serialized.notes });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="simulation-rachat-actions-${id}.pdf"`);
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }
);

function buildSimulationResponse(result: ReturnType<typeof calculateLeveragedBuyback>) {
  const { input, metrics } = result;
  const monthlyPaymentRounded = round(metrics.monthlyPayment, 2);
  return {
    inputs: {
      loanAmount: round(input.loanAmount, 2),
      interestRatePercent: round(input.interestRate * 100, 3),
      taxRatePercent: round(input.taxRate * 100, 3),
      expectedGrowthPercent: round(input.expectedGrowth * 100, 3),
      termYears: round(input.termYears, 3)
    },
    metrics: {
      monthlyPayment: monthlyPaymentRounded,
      totalInterest: round(metrics.totalInterest, 2),
      taxShield: round(metrics.taxShield, 2),
      afterTaxInterest: round(metrics.afterTaxInterest, 2),
      projectedShareValue: round(metrics.projectedShareValue, 2),
      projectedShareGain: round(metrics.projectedShareGain, 2),
      netGain: round(metrics.netGain, 2),
      breakEvenGrowth: metrics.breakEvenGrowth,
      breakEvenGrowthPercent: round(metrics.breakEvenGrowth * 100, 3),
      returnOnInvestment: metrics.returnOnInvestment,
      returnOnInvestmentPercent: round(metrics.returnOnInvestment * 100, 3),
      paybackYears: metrics.paybackYears ? round(metrics.paybackYears, 2) : null,
      monthlyPaymentRounded
    }
  };
}

export { leveragedBuybackRouter };
