"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.revenuesRouter = void 0;
const express_1 = __importStar(require("express"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const revenuesRouter = (0, express_1.Router)();
exports.revenuesRouter = revenuesRouter;
const frequencyValues = ['PONCTUEL', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'];
const optionalDate = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    return value;
}, zod_1.z.coerce.date().optional());
const querySchema = zod_1.z.object({
    propertyId: zod_1.z.coerce.number().int().positive().optional()
});
const revenueBodySchema = zod_1.z.object({
    propertyId: zod_1.z.coerce.number().int().positive(),
    label: zod_1.z.string().trim().min(1),
    amount: zod_1.z.coerce.number().gt(0),
    frequency: zod_1.z
        .string()
        .min(1)
        .transform((value) => value.toUpperCase())
        .pipe(zod_1.z.enum(frequencyValues)),
    startDate: zod_1.z.coerce.date(),
    endDate: optionalDate
});
const idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number().int().positive() });
function serializeRevenue(revenue) {
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
revenuesRouter.use(authenticated_1.authenticated);
revenuesRouter.get('/', async (req, res, next) => {
    try {
        const { propertyId } = querySchema.parse(req.query);
        const revenues = (await prisma_1.prisma.revenue.findMany({
            where: {
                property: { userId: req.userId },
                ...(propertyId ? { propertyId } : {})
            },
            include: { property: { select: { id: true, name: true } } },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }]
        }));
        res.json(revenues.map(serializeRevenue));
    }
    catch (error) {
        next(error);
    }
});
function splitCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            }
            else {
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
function parseCsvContent(csv) {
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
    const rows = [];
    const errors = [];
    const getCell = (cells, key) => {
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
            if (!frequencyValues.includes(frequencyCell)) {
                throw new Error(`Fréquence invalide: ${frequencyCell}`);
            }
            if (!startDate) {
                throw new Error('Date de début manquante.');
            }
            const parsedRow = {
                line: i + 1,
                label,
                amount,
                frequency: frequencyCell,
                startDate,
                endDate: endDate && endDate.length > 0 ? endDate : undefined
            };
            if (propertyIdCell && propertyIdCell.length > 0) {
                parsedRow.propertyId = Number(propertyIdCell);
            }
            else if (propertyNameCell && propertyNameCell.length > 0) {
                parsedRow.propertyName = propertyNameCell;
            }
            else {
                throw new Error('Identifiant immeuble manquant.');
            }
            rows.push(parsedRow);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Ligne invalide.';
            errors.push({ line: i + 1, message });
        }
    }
    return { rows, errors };
}
revenuesRouter.post('/', async (req, res, next) => {
    try {
        const data = revenueBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id: data.propertyId, userId: req.userId }
        });
        if (!property) {
            return res.status(404).json({ error: "Immeuble introuvable." });
        }
        const revenue = (await prisma_1.prisma.revenue.create({
            data: {
                propertyId: data.propertyId,
                label: data.label,
                amount: data.amount,
                frequency: data.frequency,
                startDate: data.startDate,
                endDate: data.endDate ?? null
            },
            include: { property: { select: { id: true, name: true } } }
        }));
        res.status(201).json(serializeRevenue(revenue));
    }
    catch (error) {
        next(error);
    }
});
revenuesRouter.post('/import', express_1.default.text({ type: ['text/csv', 'application/csv', 'text/plain'] }), async (req, res, next) => {
    try {
        if (typeof req.body !== 'string' || req.body.trim().length === 0) {
            return res.status(400).json({ error: 'Fichier CSV manquant ou vide.' });
        }
        const { rows, errors: parsingErrors } = parseCsvContent(req.body);
        const properties = await prisma_1.prisma.property.findMany({
            where: { userId: req.userId },
            select: { id: true, name: true }
        });
        const propertyById = new Map();
        const propertyByName = new Map();
        properties.forEach(({ id, name }) => {
            const property = { id, name };
            propertyById.set(id, property);
            propertyByName.set(name.trim().toLowerCase(), property);
        });
        const validationErrors = [...parsingErrors];
        const validRows = [];
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
        const created = (await prisma_1.prisma.$transaction(validRows.map((row) => prisma_1.prisma.revenue.create({
            data: {
                propertyId: row.data.propertyId,
                label: row.data.label,
                amount: row.data.amount,
                frequency: row.data.frequency,
                startDate: row.data.startDate,
                endDate: row.data.endDate ?? null
            },
            include: { property: { select: { id: true, name: true } } }
        }))));
        res.status(201).json({
            inserted: created.length,
            errors: validationErrors,
            items: created.map(serializeRevenue)
        });
    }
    catch (error) {
        next(error);
    }
});
revenuesRouter.put('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = revenueBodySchema.parse(req.body);
        const existing = await prisma_1.prisma.revenue.findFirst({
            where: { id, property: { userId: req.userId } }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Revenu introuvable.' });
        }
        const property = await prisma_1.prisma.property.findFirst({
            where: { id: data.propertyId, userId: req.userId }
        });
        if (!property) {
            return res.status(404).json({ error: "Immeuble introuvable." });
        }
        const revenue = (await prisma_1.prisma.revenue.update({
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
        }));
        res.json(serializeRevenue(revenue));
    }
    catch (error) {
        next(error);
    }
});
revenuesRouter.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const deleted = await prisma_1.prisma.revenue.deleteMany({
            where: { id, property: { userId: req.userId } }
        });
        if (deleted.count === 0) {
            return res.status(404).json({ error: 'Revenu introuvable.' });
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
