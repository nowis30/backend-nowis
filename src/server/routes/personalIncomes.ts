import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';
import { PERSONAL_INCOME_CATEGORIES, getPersonalIncomeSummary } from '../services/personalIncomeService';
import { extractPersonalTaxReturn } from '../services/tax';
import { env } from '../env';

const personalIncomeInclude = Prisma.validator<Prisma.PersonalIncomeInclude>()({
  shareholder: { select: { id: true, displayName: true } }
});

type PersonalIncomeWithShareholder = Prisma.PersonalIncomeGetPayload<{
  include: typeof personalIncomeInclude;
}>;

const personalIncomesRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdfMime = /^application\/(pdf|x-pdf)$/i.test(file.mimetype);
    const isImageMime = /^image\/(png|jpe?g|webp|heic)$/i.test(file.mimetype);
    // Certains navigateurs envoient application/octet-stream pour les PDF
    const isOctetPdf =
      /octet-stream/i.test(file.mimetype) && /\.pdf$/i.test(file.originalname || '');

    const ok = isPdfMime || isImageMime || isOctetPdf;
    if (!ok) {
      const err: any = new Error('Type de fichier non supporté (PDF ou image requis).');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

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

// --- Profil personnel (informations démographiques basiques) ---
const profileUpdateSchema = z.object({
  displayName: z
    .preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1).max(255))
    .optional(),
  address: optionalTrimmedString,
  birthDate: z
    .union([z.string(), z.date()])
    .transform((value) => (value instanceof Date ? value : new Date(value)))
    .refine((value) => !Number.isNaN(value?.getTime()), { message: 'Date de naissance invalide.' })
    .optional(),
  gender: z
    .preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(['MALE', 'FEMALE', 'OTHER']))
    .optional()
});

personalIncomesRouter.get(
  '/profile',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Récupère (ou provisionne) le profil actionnaire principal de l'utilisateur
      let shareholder = await prisma.shareholder.findFirst({
        where: { userId: req.userId },
        orderBy: [{ id: 'asc' }]
      });

      if (!shareholder) {
        const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
        shareholder = await prisma.shareholder.create({
          data: { userId: req.userId!, displayName: 'Profil personnel', contactEmail: user?.email ?? null }
        });
      }

      const latestReturn = await prisma.personalTaxReturn.findFirst({
        where: { shareholderId: shareholder.id },
        orderBy: [{ taxYear: 'desc' }]
      });

      const shAny = shareholder as any;
      res.json({
        id: shareholder.id,
        displayName: shareholder.displayName,
        address: (shAny.address as string | null | undefined) ?? null,
        birthDate: shAny.birthDate ? new Date(shAny.birthDate).toISOString() : null,
        gender: (shAny.gender as string | null | undefined) ?? null,
        contactEmail: shareholder.contactEmail ?? null,
        contactPhone: shareholder.contactPhone ?? null,
        latestTaxableIncome: latestReturn ? Number(latestReturn.taxableIncome) : null,
        latestTaxYear: latestReturn ? latestReturn.taxYear : null
      });
    } catch (error) {
      next(error);
    }
  }
);

personalIncomesRouter.put(
  '/profile',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const payload = profileUpdateSchema.parse(req.body);

      let shareholder = await prisma.shareholder.findFirst({
        where: { userId: req.userId },
        orderBy: [{ id: 'asc' }]
      });

      if (!shareholder) {
        const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
        shareholder = await prisma.shareholder.create({
          data: { userId: req.userId!, displayName: 'Profil personnel', contactEmail: user?.email ?? null }
        });
      }

      const updated = await prisma.shareholder.update({
        where: { id: shareholder.id },
        data: {
          displayName: payload.displayName ?? shareholder.displayName,
          // Champs ajoutés: on cast en any tant que le client Prisma n'est pas régénéré
          ...(payload.address !== undefined ? { address: payload.address } : {}),
          ...(payload.birthDate !== undefined ? { birthDate: payload.birthDate as Date | null } : {}),
          ...(payload.gender !== undefined ? { gender: payload.gender } : {})
        } as any
      });

      const upAny = updated as any;
      res.json({
        id: updated.id,
        displayName: updated.displayName,
        address: (upAny.address as string | null | undefined) ?? null,
        birthDate: upAny.birthDate ? new Date(upAny.birthDate).toISOString() : null,
        gender: (upAny.gender as string | null | undefined) ?? null,
        contactEmail: updated.contactEmail ?? null,
        contactPhone: updated.contactPhone ?? null
      });
    } catch (error) {
      next(error);
    }
  }
);

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

export { personalIncomesRouter };

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

    const incomes = await prisma.personalIncome.findMany({
      where: {
        shareholder: { userId: req.userId },
        ...(shareholderId ? { shareholderId } : {}),
        ...(taxYear ? { taxYear } : {})
      },
      include: personalIncomeInclude,
      orderBy: [{ taxYear: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }]
    });

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

    const created = await prisma.personalIncome.create({
      data: {
        shareholderId: payload.shareholderId,
        taxYear: payload.taxYear,
        category: payload.category,
        label: payload.label,
        source: payload.source ?? null,
        slipType: payload.slipType ?? null,
        amount: payload.amount
      },
      include: personalIncomeInclude
    });

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

      const existing = await prisma.personalIncome.findFirst({
        where: { id, shareholder: { userId: req.userId } }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Revenu personnel introuvable.' });
      }

      const updated = await prisma.personalIncome.update({
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
        include: personalIncomeInclude
      });

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

// --- Import de rapports d'impôt personnels ---
const importQuerySchema = z.object({
  autoCreate: z
    .preprocess((v) => (typeof v === 'string' ? v.toLowerCase().trim() : v), z.enum(['true', 'false']).optional())
    .optional(),
  shareholderId: z.coerce.number().int().positive().optional(),
  taxYear: z.coerce.number().int().min(2000).max(new Date().getFullYear() + 1).optional()
});

function normalizeCategory(input: string): (typeof PERSONAL_INCOME_CATEGORIES)[number] {
  const upper = input.trim().toUpperCase();
  const set = new Set(PERSONAL_INCOME_CATEGORIES);
  return (set.has(upper as (typeof PERSONAL_INCOME_CATEGORIES)[number])
    ? (upper as (typeof PERSONAL_INCOME_CATEGORIES)[number])
    : 'OTHER');
}

function hasOpenAiKey(): boolean {
  const configuredKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  return typeof configuredKey === 'string' && configuredKey.trim().length > 0;
}

personalIncomesRouter.post(
  '/import',
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Garde de configuration: si pas de clé OpenAI, retourner 501 explicite
      if (!hasOpenAiKey()) {
        return res.status(501).json({
          error:
            "Extraction indisponible: configurez OPENAI_API_KEY (ou Azure équivalent) pour activer l'import des rapports d'impôt."
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Fichier requis (PDF ou image) sous le champ "file".' });
      }

      const { autoCreate, shareholderId, taxYear } = importQuerySchema.parse(req.query);

      let resolvedShareholderId = shareholderId ?? null;
      if (!resolvedShareholderId) {
        // Create or get default personal profile
        const existing = await prisma.shareholder.findFirst({
          where: { userId: req.userId },
          orderBy: [{ id: 'asc' }]
        });
        if (existing) {
          resolvedShareholderId = existing.id;
        } else {
          const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } });
          const created = await prisma.shareholder.create({
            data: { userId: req.userId!, displayName: 'Profil personnel', contactEmail: user?.email ?? null },
            select: { id: true }
          });
          resolvedShareholderId = created.id;
        }
      } else {
        const sh = await ensureShareholderOwnership(req.userId!, resolvedShareholderId);
        if (!sh) {
          return res.status(404).json({ error: 'Actionnaire introuvable.' });
        }
      }

      const extraction = await extractPersonalTaxReturn({
        buffer: req.file.buffer,
        contentType: req.file.mimetype
      });

      // Optionally override the year with query param
      const targetYear = taxYear ?? extraction.taxYear;
      if (!targetYear) {
        return res.status(422).json({ error: "Année d'imposition introuvable dans le document et non fournie." });
      }

      const items = extraction.items.map((it: { category: string; label: string; amount: number; source?: string; slipType?: string }) => ({
        category: normalizeCategory(it.category),
        label: it.label,
        source: it.source ?? null,
        slipType: it.slipType ?? null,
        amount: Number(it.amount ?? 0)
      }));

  const createdIds: number[] = [];
      const shouldCreate = (autoCreate ?? 'false') === 'true';
      if (shouldCreate) {
        for (const item of items) {
          if (!(item.label && item.amount > 0)) continue;
          const created = await prisma.personalIncome.create({
            data: {
              shareholderId: resolvedShareholderId!,
              taxYear: targetYear,
              category: item.category,
              label: item.label,
              source: item.source,
              slipType: item.slipType,
              amount: item.amount
            },
            select: { id: true }
          });
          createdIds.push(created.id);
        }
      }

      res.json({
        shareholderId: resolvedShareholderId,
        taxYear: targetYear,
        extracted: items,
        createdIds
      });
    } catch (error) {
      next(error);
    }
  }
);
