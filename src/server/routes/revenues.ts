import express, { Router, Response, NextFunction } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { authenticated, AuthenticatedRequest } from '../middlewares/authenticated';

type DecimalLike = unknown;

const revenuesRouter = Router();

const frequencyValues = ['PONCTUEL', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'] as const;

type Frequency = (typeof frequencyValues)[number];

const optionalDate = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return value;
}, z.coerce.date().optional());

const querySchema = z.object({
  propertyId: z.coerce.number().int().positive().optional()
});

const revenueBodySchema = z.object({
  propertyId: z.coerce.number().int().positive(),
  label: z.string().trim().min(1),
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

interface RevenueWithProperty {
  id: number;
  propertyId: number;
  label: string;
  amount: DecimalLike;
  frequency: Frequency;
  startDate: Date;
  endDate: Date | null;
  property: { id: number; name: string };
}

interface CsvParsingError {
  line: number;
  message: string;
}

interface ParsedCsvRow {
  line: number;
  propertyId?: number;
  propertyName?: string;
  label: string;
  amount: number;
  frequency: string;
  startDate: string;
  endDate?: string;
}

function serializeRevenue(revenue: RevenueWithProperty) {
  return {
    id: revenue.id,
    propertyId: revenue.propertyId,
    label: revenue.label,
    amount: Number(revenue.amount ?? 0),
    frequency: revenue.frequency,
    startDate: revenue.startDate.toISOString(),
    endDate: revenue.endDate ? revenue.endDate.toISOString() : null,
    property: revenue.property
  };
}

revenuesRouter.use(authenticated);

revenuesRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { propertyId } = querySchema.parse(req.query);

    const revenues = (await prisma.revenue.findMany({
      where: {
        property: { userId: req.userId },
        ...(propertyId ? { propertyId } : {})
      },
      include: { property: { select: { id: true, name: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }]
    })) as RevenueWithProperty[];

    res.json(revenues.map(serializeRevenue));
  } catch (error) {
    next(error);
  }
});

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvContent(csv: string): { rows: ParsedCsvRow[]; errors: CsvParsingError[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'Fichier CSV vide.' }] };
  }

  const headerCells = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const requiredColumns = ['label', 'amount', 'frequency', 'startdate'];
  const hasPropertyId = headerCells.includes('propertyid');
  const hasPropertyName = headerCells.includes('propertyname');

  if (!hasPropertyId && !hasPropertyName) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: "Le fichier doit contenir la colonne 'propertyId' ou 'propertyName'."
        }
      ]
    };
  }

  const missingColumns = requiredColumns.filter((column) => !headerCells.includes(column));
  if (missingColumns.length > 0) {
    return {
      rows: [],
      errors: missingColumns.map((column) => ({
        line: 1,
        message: `Colonne obligatoire manquante: ${column}`
      }))
    };
  }

  const rows: ParsedCsvRow[] = [];
  const errors: CsvParsingError[] = [];

  const getCell = (cells: string[], key: string) => {
    const index = headerCells.indexOf(key);
    if (index === -1) {
      return undefined;
    }
    return cells[index] ?? '';
  };

  for (let i = 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine) {
      continue;
    }

    const cells = splitCsvLine(rawLine);
    if (cells.length === 0) {
      continue;
    }

    try {
      const propertyIdCell = hasPropertyId ? getCell(cells, 'propertyid') : undefined;
      const propertyNameCell = hasPropertyName ? getCell(cells, 'propertyname') : undefined;
      const label = getCell(cells, 'label') ?? '';
      const amountCell = getCell(cells, 'amount') ?? '';
      const frequencyCell = (getCell(cells, 'frequency') ?? '').toUpperCase();
      const startDate = getCell(cells, 'startdate') ?? '';
      const endDate = getCell(cells, 'enddate');

      if (!label) {
        throw new Error('Libellé manquant.');
      }

      const amount = Number(amountCell);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Montant invalide.');
      }

      if (!frequencyValues.includes(frequencyCell as Frequency)) {
        throw new Error(`Fréquence invalide: ${frequencyCell}`);
      }

      if (!startDate) {
        throw new Error('Date de début manquante.');
      }

      const parsedRow: ParsedCsvRow = {
        line: i + 1,
        label,
        amount,
        frequency: frequencyCell,
        startDate,
        endDate: endDate && endDate.length > 0 ? endDate : undefined
      };

      if (propertyIdCell && propertyIdCell.length > 0) {
        parsedRow.propertyId = Number(propertyIdCell);
      } else if (propertyNameCell && propertyNameCell.length > 0) {
        parsedRow.propertyName = propertyNameCell;
      } else {
        throw new Error('Identifiant immeuble manquant.');
      }

  rows.push(parsedRow);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ligne invalide.';
      errors.push({ line: i + 1, message });
    }
  }

  return { rows, errors };
}

revenuesRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const data = revenueBodySchema.parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, userId: req.userId }
    });

    if (!property) {
      return res.status(404).json({ error: "Immeuble introuvable." });
    }

    const revenue = (await prisma.revenue.create({
      data: {
        propertyId: data.propertyId,
        label: data.label,
        amount: data.amount,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate ?? null
      },
      include: { property: { select: { id: true, name: true } } }
    })) as RevenueWithProperty;

    res.status(201).json(serializeRevenue(revenue));
  } catch (error) {
    next(error);
  }
});

revenuesRouter.post(
  '/import',
  express.text({ type: ['text/csv', 'application/csv', 'text/plain'] }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (typeof req.body !== 'string' || req.body.trim().length === 0) {
        return res.status(400).json({ error: 'Fichier CSV manquant ou vide.' });
      }

      const { rows, errors: parsingErrors } = parseCsvContent(req.body);
      const properties: Array<{ id: number; name: string }> = await prisma.property.findMany({
        where: { userId: req.userId },
        select: { id: true, name: true }
      });

      const propertyById = new Map<number, { id: number; name: string }>();
      const propertyByName = new Map<string, { id: number; name: string }>();

      properties.forEach(({ id, name }) => {
        const property = { id, name };
        propertyById.set(id, property);
        propertyByName.set(name.trim().toLowerCase(), property);
      });

      const validationErrors: CsvParsingError[] = [...parsingErrors];
      const validRows: Array<{ line: number; data: z.infer<typeof revenueBodySchema> }> = [];

      rows.forEach((row) => {
        let propertyId = row.propertyId;

        if (!propertyId && row.propertyName) {
          const match = propertyByName.get(row.propertyName.trim().toLowerCase());
          if (match) {
            propertyId = match.id;
          }
        }

        if (!propertyId) {
          validationErrors.push({ line: row.line, message: "Immeuble introuvable." });
          return;
        }

        if (!propertyById.has(propertyId)) {
          validationErrors.push({ line: row.line, message: "Immeuble introuvable." });
          return;
        }

        const payload = {
          propertyId,
          label: row.label,
          amount: row.amount,
          frequency: row.frequency,
          startDate: row.startDate,
          endDate: row.endDate
        };

        const result = revenueBodySchema.safeParse(payload);
        if (!result.success) {
          const issue = result.error.issues[0];
          validationErrors.push({ line: row.line, message: issue?.message ?? 'Ligne invalide.' });
          return;
        }

        validRows.push({ line: row.line, data: result.data });
      });

      if (validRows.length === 0) {
        return res.status(400).json({
          error: 'Aucune ligne valide trouvée dans le fichier CSV.',
          details: validationErrors
        });
      }

      const created = (await prisma.$transaction(
        validRows.map((row) =>
          prisma.revenue.create({
            data: {
              propertyId: row.data.propertyId,
              label: row.data.label,
              amount: row.data.amount,
              frequency: row.data.frequency,
              startDate: row.data.startDate,
              endDate: row.data.endDate ?? null
            },
            include: { property: { select: { id: true, name: true } } }
          })
        )
      )) as RevenueWithProperty[];

      res.status(201).json({
        inserted: created.length,
        errors: validationErrors,
        items: created.map(serializeRevenue)
      });
    } catch (error) {
      next(error);
    }
  }
);

revenuesRouter.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = revenueBodySchema.parse(req.body);

    const existing = await prisma.revenue.findFirst({
      where: { id, property: { userId: req.userId } }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Revenu introuvable.' });
    }

    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, userId: req.userId }
    });

    if (!property) {
      return res.status(404).json({ error: "Immeuble introuvable." });
    }

    const revenue = (await prisma.revenue.update({
      where: { id },
      data: {
        propertyId: data.propertyId,
        label: data.label,
        amount: data.amount,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate ?? null
      },
      include: { property: { select: { id: true, name: true } } }
    })) as RevenueWithProperty;

    res.json(serializeRevenue(revenue));
  } catch (error) {
    next(error);
  }
});

revenuesRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);

    const deleted = await prisma.revenue.deleteMany({
      where: { id, property: { userId: req.userId } }
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Revenu introuvable.' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export { revenuesRouter };
