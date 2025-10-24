import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';

const companiesRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const optionalTrimmedString = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    return value;
  }, z.string().max(255))
  .optional();

const optionalLongText = z
  .preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    return value;
  }, z.string().max(5000))
  .optional();

const optionalNullableTrimmedString = z
  .preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return value;
  }, z.string().max(255).nullable())
  .optional();

const optionalNullableLongText = z
  .preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return value;
  }, z.string().max(5000).nullable())
  .optional();

const decimalNumber = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return value;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Number(numeric) : value;
}, z.number());

const optionalDate = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
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

    return value;
  }, z.date())
  .optional();

const companyBodySchema = z.object({
  name: z.string().trim().min(1),
  province: optionalTrimmedString,
  fiscalYearEnd: optionalDate,
  neq: optionalTrimmedString,
  notes: optionalLongText
});

const companySummaryInclude = {
  _count: {
    select: {
      properties: true,
      shareholderLinks: true,
      shareClasses: true,
      shareTransactions: true,
      statements: true,
      resolutions: true
    }
  }
} satisfies Prisma.CompanyInclude;

const companyDetailInclude = {
  properties: {
    select: {
      id: true,
      name: true,
      address: true,
      acquisitionDate: true,
      purchasePrice: true,
      currentValue: true,
      notes: true
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }]
  },
  shareholderLinks: {
    include: {
      shareholder: {
        select: {
          id: true,
          type: true,
          displayName: true,
          contactEmail: true,
          contactPhone: true
        }
      }
    },
    orderBy: [{ shareholder: { displayName: 'asc' } }, { id: 'asc' }]
  },
  shareClasses: {
    orderBy: [{ code: 'asc' }, { id: 'asc' }]
  },
  shareTransactions: {
    include: {
      shareholder: {
        select: {
          id: true,
          displayName: true,
          type: true
        }
      },
      shareClass: {
        select: {
          id: true,
          code: true,
          description: true
        }
      }
    },
    orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }]
  },
  statements: {
    include: {
      lines: {
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]
      }
    },
    orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }]
  },
  resolutions: {
    orderBy: [{ resolutionDate: 'desc' }, { id: 'desc' }]
  }
} satisfies Prisma.CompanyInclude;

type CompanySummaryResult = Prisma.CompanyGetPayload<{
  include: typeof companySummaryInclude;
}>;

type CompanyDetailResult = Prisma.CompanyGetPayload<{
  include: typeof companyDetailInclude;
}>;

const shareholderLinkInclude = {
  shareholder: {
    select: {
      id: true,
      type: true,
      displayName: true,
      contactEmail: true,
      contactPhone: true
    }
  }
} satisfies Prisma.CompanyShareholderInclude;

const shareTransactionInclude = {
  shareholder: {
    select: {
      id: true,
      displayName: true,
      type: true
    }
  },
  shareClass: {
    select: {
      id: true,
      code: true,
      description: true
    }
  }
} satisfies Prisma.ShareTransactionInclude;

type ShareholderLinkResult = Prisma.CompanyShareholderGetPayload<{
  include: typeof shareholderLinkInclude;
}>;

type ShareClassResult = Prisma.ShareClassGetPayload<{}>;

type ShareTransactionResult = Prisma.ShareTransactionGetPayload<{
  include: typeof shareTransactionInclude;
}>;

type StatementResult = Prisma.CorporateStatementGetPayload<{
  include: {
    lines: true;
  };
}>;

type ResolutionResult = Prisma.CorporateResolutionGetPayload<{}>;

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return Number(value);
}

function serializeShareholderLink(link: ShareholderLinkResult) {
  return {
    id: link.id,
    role: link.role,
    votingPercent: decimalToNumber(link.votingPercent),
    shareholder: {
      id: link.shareholder.id,
      type: link.shareholder.type,
      displayName: link.shareholder.displayName,
      contactEmail: link.shareholder.contactEmail,
      contactPhone: link.shareholder.contactPhone
    }
  };
}

function serializeShareClass(shareClass: ShareClassResult) {
  return {
    id: shareClass.id,
    code: shareClass.code,
    description: shareClass.description,
    hasVotingRights: shareClass.hasVotingRights,
    participatesInGrowth: shareClass.participatesInGrowth,
    dividendPolicy: shareClass.dividendPolicy,
    createdAt: shareClass.createdAt.toISOString(),
    updatedAt: shareClass.updatedAt.toISOString()
  };
}

function serializeShareTransaction(transaction: ShareTransactionResult) {
  return {
    id: transaction.id,
    type: transaction.type,
    transactionDate: transaction.transactionDate.toISOString(),
    quantity: decimalToNumber(transaction.quantity),
    pricePerShare: decimalToNumber(transaction.pricePerShare),
    considerationPaid: decimalToNumber(transaction.considerationPaid),
    fairMarketValue: decimalToNumber(transaction.fairMarketValue),
    notes: transaction.notes,
    shareholder: transaction.shareholder
      ? {
          id: transaction.shareholder.id,
          displayName: transaction.shareholder.displayName,
          type: transaction.shareholder.type
        }
      : null,
    shareClass: transaction.shareClass
      ? {
          id: transaction.shareClass.id,
          code: transaction.shareClass.code,
          description: transaction.shareClass.description
        }
      : null
  };
}

function serializeStatement(statement: StatementResult) {
  return {
    id: statement.id,
    statementType: statement.statementType,
    periodStart: statement.periodStart.toISOString(),
    periodEnd: statement.periodEnd.toISOString(),
    isAudited: statement.isAudited,
    totals: {
      assets: decimalToNumber(statement.totalAssets),
      liabilities: decimalToNumber(statement.totalLiabilities),
      equity: decimalToNumber(statement.totalEquity),
      revenue: decimalToNumber(statement.totalRevenue),
      expenses: decimalToNumber(statement.totalExpenses),
      netIncome: decimalToNumber(statement.netIncome)
    },
    metadata: statement.metadata,
    lines: statement.lines.map((line) => ({
      id: line.id,
      category: line.category,
      label: line.label,
      amount: decimalToNumber(line.amount),
      orderIndex: line.orderIndex,
      metadata: line.metadata
    })),
    createdAt: statement.createdAt.toISOString(),
    updatedAt: statement.updatedAt.toISOString()
  };
}

function serializeResolution(resolution: ResolutionResult) {
  return {
    id: resolution.id,
    type: resolution.type,
    title: resolution.title,
    resolutionDate: resolution.resolutionDate.toISOString(),
    body: resolution.body,
    metadata: resolution.metadata,
    createdAt: resolution.createdAt.toISOString(),
    updatedAt: resolution.updatedAt.toISOString()
  };
}

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

const positiveNumber = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return value;
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(numeric as number) ? Number(numeric) : value;
}, z.number().positive());

const optionalDecimal = z
  .preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric as number) ? Number(numeric) : value;
  }, z.number())
  .optional();

const optionalPercentage = z
  .preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    const numeric = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numeric as number)) {
      return undefined;
    }

    const coerced = Number(numeric);
    return Math.min(100, Math.max(0, coerced));
  }, z.number().min(0).max(100))
  .optional();

const optionalBoolean = z
  .preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'oui', 'yes'].includes(normalized)) {
        return true;
      }

      if (['false', '0', 'non', 'no'].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean())
  .optional();

const shareholderTypeInput = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(['PERSON', 'CORPORATION']))
  .optional();

const shareholderInputSchema = z.object({
  displayName: z.string().trim().min(1),
  type: shareholderTypeInput,
  contactEmail: optionalTrimmedString,
  contactPhone: optionalTrimmedString,
  notes: optionalLongText
});

const shareholderUpdateSchema = z
  .object({
    displayName: optionalTrimmedString,
    type: shareholderTypeInput,
    contactEmail: optionalNullableTrimmedString,
    contactPhone: optionalNullableTrimmedString,
    notes: optionalNullableLongText
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Aucune donnée actionnaire fournie.',
    path: ['displayName']
  });

const statementLineInputSchema = z.object({
  category: z.string().trim().min(1),
  label: z.string().trim().min(1),
  amount: decimalNumber,
  orderIndex: z.coerce.number().int().min(0).optional(),
  metadata: optionalLongText
});

const corporateStatementBodySchema = z.object({
  statementType: z.string().trim().min(1),
  periodStart: requiredDate,
  periodEnd: requiredDate,
  isAudited: optionalBoolean,
  totalAssets: optionalDecimal,
  totalLiabilities: optionalDecimal,
  totalEquity: optionalDecimal,
  totalRevenue: optionalDecimal,
  totalExpenses: optionalDecimal,
  netIncome: optionalDecimal,
  metadata: optionalLongText,
  lines: z.array(statementLineInputSchema).optional()
});

const corporateStatementUpdateSchema = z
  .object({
    statementType: optionalTrimmedString,
    periodStart: optionalDate,
    periodEnd: optionalDate,
    isAudited: optionalBoolean,
    totalAssets: optionalDecimal,
    totalLiabilities: optionalDecimal,
    totalEquity: optionalDecimal,
    totalRevenue: optionalDecimal,
    totalExpenses: optionalDecimal,
    netIncome: optionalDecimal,
    metadata: optionalLongText,
    lines: z.array(statementLineInputSchema).optional()
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Aucune donnée fournie.',
    path: ['statementType']
  });

const corporateResolutionBodySchema = z.object({
  type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  resolutionDate: requiredDate,
  body: optionalLongText,
  metadata: optionalLongText
});

const corporateResolutionUpdateSchema = z
  .object({
    type: optionalTrimmedString,
    title: optionalTrimmedString,
    resolutionDate: optionalDate,
    body: optionalLongText,
    metadata: optionalLongText
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Aucune donnée fournie.',
    path: ['type']
  });

const shareholderLinkBodySchema = z
  .object({
    shareholderId: z.coerce.number().int().positive().optional(),
    shareholder: shareholderInputSchema.optional(),
    role: optionalTrimmedString,
    votingPercent: optionalPercentage
  })
  .refine((value) => Boolean(value.shareholderId) || Boolean(value.shareholder), {
    message: 'Un actionnaire doit être fourni.',
    path: ['shareholderId']
  });

const shareholderLinkUpdateSchema = z.object({
  role: optionalTrimmedString,
  votingPercent: optionalPercentage,
  shareholder: shareholderUpdateSchema.optional()
});

const companyShareholderParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  linkId: z.coerce.number().int().positive()
});

const shareClassBodySchema = z.object({
  code: z.string().trim().min(1).max(25),
  description: optionalLongText,
  hasVotingRights: optionalBoolean,
  participatesInGrowth: optionalBoolean,
  dividendPolicy: optionalLongText
});

const shareClassParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  shareClassId: z.coerce.number().int().positive()
});

const shareTransactionBodySchema = z.object({
  shareholderId: z.coerce.number().int().positive(),
  shareClassId: z.coerce.number().int().positive(),
  type: z.string().trim().min(1),
  transactionDate: requiredDate,
  quantity: positiveNumber,
  pricePerShare: optionalDecimal,
  considerationPaid: optionalDecimal,
  fairMarketValue: optionalDecimal,
  notes: optionalLongText
});

const shareTransactionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  transactionId: z.coerce.number().int().positive()
});

const companyStatementParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  statementId: z.coerce.number().int().positive()
});

const companyResolutionParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  resolutionId: z.coerce.number().int().positive()
});

function serializeCompanySummary(company: CompanySummaryResult) {
  return {
    id: company.id,
    name: company.name,
    province: company.province,
    fiscalYearEnd: company.fiscalYearEnd ? company.fiscalYearEnd.toISOString() : null,
    neq: company.neq,
    notes: company.notes,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    counts: {
      properties: company._count?.properties ?? 0,
      shareholders: company._count?.shareholderLinks ?? 0,
      shareClasses: company._count?.shareClasses ?? 0,
      shareTransactions: company._count?.shareTransactions ?? 0,
      statements: company._count?.statements ?? 0,
      resolutions: company._count?.resolutions ?? 0
    }
  };
}

function serializeCompanyDetail(company: CompanyDetailResult) {
  return {
    id: company.id,
    name: company.name,
    province: company.province,
    fiscalYearEnd: company.fiscalYearEnd ? company.fiscalYearEnd.toISOString() : null,
    neq: company.neq,
    notes: company.notes,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    properties: company.properties.map((property) => ({
      id: property.id,
      name: property.name,
      address: property.address,
      acquisitionDate: property.acquisitionDate ? property.acquisitionDate.toISOString() : null,
      purchasePrice: decimalToNumber(property.purchasePrice),
      currentValue: decimalToNumber(property.currentValue),
      notes: property.notes
    })),
    shareholders: company.shareholderLinks.map(serializeShareholderLink),
    shareClasses: company.shareClasses.map(serializeShareClass),
    shareTransactions: company.shareTransactions.map(serializeShareTransaction),
    statements: company.statements.map((statement) => ({
      ...serializeStatement(statement)
    })),
    resolutions: company.resolutions.map((resolution) => ({
      ...serializeResolution(resolution)
    }))
  };
}

companiesRouter.use(authenticated);

companiesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const companies = await prisma.company.findMany({
      where: { userId: req.userId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: companySummaryInclude
    });

    res.json(companies.map(serializeCompanySummary));
  } catch (error) {
    next(error);
  }
});

companiesRouter.post('/', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = companyBodySchema.parse(req.body);

    const company = await prisma.company.create({
      data: {
        userId: req.userId!,
        name: data.name,
        province: data.province ?? null,
        fiscalYearEnd: data.fiscalYearEnd ?? null,
        neq: data.neq ?? null,
        notes: data.notes ?? null
      },
      include: companyDetailInclude
    });

    res.status(201).json(serializeCompanyDetail(company));
  } catch (error) {
    next(error);
  }
});

companiesRouter.get(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const company = await prisma.company.findFirst({
        where: { id, userId: req.userId },
        include: companyDetailInclude
      });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      res.json(serializeCompanyDetail(company));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = companyBodySchema.parse(req.body);

      const existing = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!existing) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const company = await prisma.company.update({
        where: { id },
        data: {
          name: data.name,
          province: data.province ?? null,
          fiscalYearEnd: data.fiscalYearEnd ?? null,
          neq: data.neq ?? null,
          notes: data.notes ?? null
        },
        include: companyDetailInclude
      });

      res.json(serializeCompanyDetail(company));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const existing = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!existing) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      await prisma.company.delete({ where: { id } });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.get(
  '/:id/shareholders',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const links = await prisma.companyShareholder.findMany({
        where: { companyId: id },
        include: shareholderLinkInclude,
        orderBy: [{ shareholder: { displayName: 'asc' } }, { id: 'asc' }]
      });

      res.json(links.map(serializeShareholderLink));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.post(
  '/:id/shareholders',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = shareholderLinkBodySchema.parse(req.body);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      let shareholderId = data.shareholderId ?? null;

      if (!shareholderId && data.shareholder) {
        const createdShareholder = await prisma.shareholder.create({
          data: {
            userId: req.userId!,
            type: data.shareholder.type ?? 'PERSON',
            displayName: data.shareholder.displayName,
            contactEmail: data.shareholder.contactEmail ?? null,
            contactPhone: data.shareholder.contactPhone ?? null,
            notes: data.shareholder.notes ?? null
          }
        });
        shareholderId = createdShareholder.id;
      }

      if (!shareholderId) {
        return res.status(400).json({ error: 'Actionnaire requis.' });
      }

      const shareholder = await prisma.shareholder.findFirst({
        where: { id: shareholderId, userId: req.userId }
      });

      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }

      const link = await prisma.companyShareholder.create({
        data: {
          companyId: id,
          shareholderId,
          role: data.role ?? null,
          votingPercent: data.votingPercent ?? null
        },
        include: shareholderLinkInclude
      });

      res.status(201).json(serializeShareholderLink(link));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id/shareholders/:linkId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, linkId } = companyShareholderParamsSchema.parse(req.params);
      const data = shareholderLinkUpdateSchema.parse(req.body);

      const existing = await prisma.companyShareholder.findFirst({
        where: { id: linkId, companyId: id, company: { userId: req.userId } },
        include: shareholderLinkInclude
      });

      if (!existing) {
        return res.status(404).json({ error: 'Lien actionnaire introuvable.' });
      }

      if (data.shareholder) {
        const shareholderUpdates: Prisma.ShareholderUpdateInput = {};

        if (data.shareholder.displayName !== undefined) {
          shareholderUpdates.displayName = data.shareholder.displayName;
        }

        if (data.shareholder.type !== undefined) {
          shareholderUpdates.type = data.shareholder.type;
        }

        if (data.shareholder.contactEmail !== undefined) {
          shareholderUpdates.contactEmail = data.shareholder.contactEmail ?? null;
        }

        if (data.shareholder.contactPhone !== undefined) {
          shareholderUpdates.contactPhone = data.shareholder.contactPhone ?? null;
        }

        if (data.shareholder.notes !== undefined) {
          shareholderUpdates.notes = data.shareholder.notes ?? null;
        }

        if (Object.keys(shareholderUpdates).length > 0) {
          await prisma.shareholder.update({
            where: { id: existing.shareholderId, userId: req.userId },
            data: shareholderUpdates
          });
        }
      }

      const link = await prisma.companyShareholder.update({
        where: { id: linkId },
        data: {
          role: data.role ?? null,
          votingPercent: data.votingPercent ?? null
        },
        include: shareholderLinkInclude
      });

      res.json(serializeShareholderLink(link));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id/shareholders/:linkId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, linkId } = companyShareholderParamsSchema.parse(req.params);

      const deleted = await prisma.companyShareholder.deleteMany({
        where: { id: linkId, companyId: id, company: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Lien actionnaire introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.get(
  '/:id/share-classes',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const shareClasses = await prisma.shareClass.findMany({
        where: { companyId: id },
        orderBy: [{ code: 'asc' }, { id: 'asc' }]
      });

      res.json(shareClasses.map(serializeShareClass));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.post(
  '/:id/share-classes',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = shareClassBodySchema.parse(req.body);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const shareClass = await prisma.shareClass.create({
        data: {
          companyId: id,
          code: data.code.trim(),
          description: data.description ?? null,
          hasVotingRights: data.hasVotingRights ?? true,
          participatesInGrowth: data.participatesInGrowth ?? true,
          dividendPolicy: data.dividendPolicy ?? null
        }
      });

      res.status(201).json(serializeShareClass(shareClass));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id/share-classes/:shareClassId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, shareClassId } = shareClassParamsSchema.parse(req.params);
      const data = shareClassBodySchema.parse(req.body);

      const existing = await prisma.shareClass.findFirst({
        where: { id: shareClassId, companyId: id, company: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Classe d\'actions introuvable.' });
      }

      const shareClass = await prisma.shareClass.update({
        where: { id: shareClassId },
        data: {
          code: data.code.trim(),
          description: data.description ?? null,
          hasVotingRights: data.hasVotingRights ?? true,
          participatesInGrowth: data.participatesInGrowth ?? true,
          dividendPolicy: data.dividendPolicy ?? null
        }
      });

      res.json(serializeShareClass(shareClass));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id/share-classes/:shareClassId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, shareClassId } = shareClassParamsSchema.parse(req.params);

      const deleted = await prisma.shareClass.deleteMany({
        where: { id: shareClassId, companyId: id, company: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Classe d\'actions introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.get(
  '/:id/share-transactions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const transactions = await prisma.shareTransaction.findMany({
        where: { companyId: id },
        include: shareTransactionInclude,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }]
      });

      res.json(transactions.map(serializeShareTransaction));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.post(
  '/:id/share-transactions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = shareTransactionBodySchema.parse(req.body);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const shareClass = await prisma.shareClass.findFirst({
        where: { id: data.shareClassId, companyId: id, company: { userId: req.userId } }
      });

      if (!shareClass) {
        return res.status(404).json({ error: 'Classe d\'actions introuvable.' });
      }

      const shareholder = await prisma.shareholder.findFirst({
        where: { id: data.shareholderId, userId: req.userId }
      });

      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }

      const transaction = await prisma.shareTransaction.create({
        data: {
          companyId: id,
          shareClassId: data.shareClassId,
          shareholderId: data.shareholderId,
          type: data.type.trim().toUpperCase(),
          transactionDate: data.transactionDate,
          quantity: data.quantity,
          pricePerShare: data.pricePerShare ?? null,
          considerationPaid: data.considerationPaid ?? null,
          fairMarketValue: data.fairMarketValue ?? null,
          notes: data.notes ?? null
        },
        include: shareTransactionInclude
      });

      res.status(201).json(serializeShareTransaction(transaction));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id/share-transactions/:transactionId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, transactionId } = shareTransactionParamsSchema.parse(req.params);
      const data = shareTransactionBodySchema.parse(req.body);

      const existing = await prisma.shareTransaction.findFirst({
        where: { id: transactionId, companyId: id, company: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }

      const shareClass = await prisma.shareClass.findFirst({
        where: { id: data.shareClassId, companyId: id, company: { userId: req.userId } }
      });

      if (!shareClass) {
        return res.status(404).json({ error: 'Classe d\'actions introuvable.' });
      }

      const shareholder = await prisma.shareholder.findFirst({
        where: { id: data.shareholderId, userId: req.userId }
      });

      if (!shareholder) {
        return res.status(404).json({ error: 'Actionnaire introuvable.' });
      }

      const transaction = await prisma.shareTransaction.update({
        where: { id: transactionId },
        data: {
          shareClassId: data.shareClassId,
          shareholderId: data.shareholderId,
          type: data.type.trim().toUpperCase(),
          transactionDate: data.transactionDate,
          quantity: data.quantity,
          pricePerShare: data.pricePerShare ?? null,
          considerationPaid: data.considerationPaid ?? null,
          fairMarketValue: data.fairMarketValue ?? null,
          notes: data.notes ?? null
        },
        include: shareTransactionInclude
      });

      res.json(serializeShareTransaction(transaction));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id/share-transactions/:transactionId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, transactionId } = shareTransactionParamsSchema.parse(req.params);

      const deleted = await prisma.shareTransaction.deleteMany({
        where: { id: transactionId, companyId: id, company: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Transaction introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.post(
  '/:id/statements',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = corporateStatementBodySchema.parse(req.body);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const lines = data.lines?.map((line, index) => ({
        category: line.category.trim(),
        label: line.label.trim(),
        amount: line.amount,
        orderIndex: line.orderIndex ?? index,
        metadata: line.metadata ?? null
      }));

      const statement = await prisma.corporateStatement.create({
        data: {
          companyId: id,
          statementType: data.statementType.trim().toUpperCase(),
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          isAudited: data.isAudited ?? false,
          totalAssets: data.totalAssets ?? 0,
          totalLiabilities: data.totalLiabilities ?? 0,
          totalEquity: data.totalEquity ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          totalExpenses: data.totalExpenses ?? 0,
          netIncome: data.netIncome ?? 0,
          metadata: data.metadata ?? null,
          lines: lines?.length
            ? {
                create: lines
              }
            : undefined
        },
        include: {
          lines: {
            orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]
          }
        }
      });

      res.status(201).json(serializeStatement(statement));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id/statements/:statementId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, statementId } = companyStatementParamsSchema.parse(req.params);
      const data = corporateStatementUpdateSchema.parse(req.body);

      const existing = await prisma.corporateStatement.findFirst({
        where: { id: statementId, companyId: id, company: { userId: req.userId } },
        include: {
          lines: {
            orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]
          }
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'État financier introuvable.' });
      }

      const updateData: Prisma.CorporateStatementUpdateInput = {};

      if (data.statementType !== undefined) {
        updateData.statementType = data.statementType.trim().toUpperCase();
      }

      if (data.periodStart !== undefined) {
        updateData.periodStart = data.periodStart;
      }

      if (data.periodEnd !== undefined) {
        updateData.periodEnd = data.periodEnd;
      }

      if (data.isAudited !== undefined) {
        updateData.isAudited = data.isAudited;
      }

      if (data.totalAssets !== undefined) {
        updateData.totalAssets = data.totalAssets ?? 0;
      }

      if (data.totalLiabilities !== undefined) {
        updateData.totalLiabilities = data.totalLiabilities ?? 0;
      }

      if (data.totalEquity !== undefined) {
        updateData.totalEquity = data.totalEquity ?? 0;
      }

      if (data.totalRevenue !== undefined) {
        updateData.totalRevenue = data.totalRevenue ?? 0;
      }

      if (data.totalExpenses !== undefined) {
        updateData.totalExpenses = data.totalExpenses ?? 0;
      }

      if (data.netIncome !== undefined) {
        updateData.netIncome = data.netIncome ?? 0;
      }

      if (data.metadata !== undefined) {
        updateData.metadata = data.metadata ?? null;
      }

      if (data.lines !== undefined) {
        const mapped = data.lines.map((line, index) => ({
          category: line.category.trim(),
          label: line.label.trim(),
          amount: line.amount,
          orderIndex: line.orderIndex ?? index,
          metadata: line.metadata ?? null
        }));

        updateData.lines = {
          deleteMany: {},
          create: mapped
        };
      }

      const statement = await prisma.corporateStatement.update({
        where: { id: statementId },
        data: updateData,
        include: {
          lines: {
            orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]
          }
        }
      });

      res.json(serializeStatement(statement));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id/statements/:statementId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, statementId } = companyStatementParamsSchema.parse(req.params);

      const deleted = await prisma.corporateStatement.deleteMany({
        where: { id: statementId, companyId: id, company: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'État financier introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.post(
  '/:id/resolutions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = corporateResolutionBodySchema.parse(req.body);

      const company = await prisma.company.findFirst({ where: { id, userId: req.userId } });

      if (!company) {
        return res.status(404).json({ error: 'Entreprise introuvable.' });
      }

      const resolution = await prisma.corporateResolution.create({
        data: {
          companyId: id,
          type: data.type.trim().toUpperCase(),
          title: data.title.trim(),
          resolutionDate: data.resolutionDate,
          body: data.body ?? null,
          metadata: data.metadata ?? null
        }
      });

      res.status(201).json(serializeResolution(resolution));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.put(
  '/:id/resolutions/:resolutionId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, resolutionId } = companyResolutionParamsSchema.parse(req.params);
      const data = corporateResolutionUpdateSchema.parse(req.body);

      const existing = await prisma.corporateResolution.findFirst({
        where: { id: resolutionId, companyId: id, company: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Résolution introuvable.' });
      }

      const updateData: Prisma.CorporateResolutionUpdateInput = {};

      if (data.type !== undefined) {
        updateData.type = data.type.trim().toUpperCase();
      }

      if (data.title !== undefined) {
        updateData.title = data.title.trim();
      }

      if (data.resolutionDate !== undefined) {
        updateData.resolutionDate = data.resolutionDate;
      }

      if (data.body !== undefined) {
        updateData.body = data.body ?? null;
      }

      if (data.metadata !== undefined) {
        updateData.metadata = data.metadata ?? null;
      }

      const resolution = await prisma.corporateResolution.update({
        where: { id: resolutionId },
        data: updateData
      });

      res.json(serializeResolution(resolution));
    } catch (error) {
      next(error);
    }
  }
);

companiesRouter.delete(
  '/:id/resolutions/:resolutionId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id, resolutionId } = companyResolutionParamsSchema.parse(req.params);

      const deleted = await prisma.corporateResolution.deleteMany({
        where: { id: resolutionId, companyId: id, company: { userId: req.userId } }
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: 'Résolution introuvable.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export { companiesRouter };