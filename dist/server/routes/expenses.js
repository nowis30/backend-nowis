"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const expensesFiscalReport_1 = require("../services/expensesFiscalReport");
const expensesRouter = (0, express_1.Router)();
exports.expensesRouter = expensesRouter;
const frequencyValues = ['PONCTUEL', 'HEBDOMADAIRE', 'MENSUEL', 'TRIMESTRIEL', 'ANNUEL'];
const optionalDate = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    return value;
}, zod_1.z.coerce.date().optional());
const expenseBodySchema = zod_1.z.object({
    propertyId: zod_1.z.coerce.number().int().positive(),
    label: zod_1.z.string().trim().min(1),
    category: zod_1.z.string().trim().min(1),
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
const fiscalExportQuerySchema = zod_1.z.object({
    year: zod_1.z.coerce.number().int().min(2000).max(2100).optional(),
    format: zod_1.z.enum(['json', 'csv']).optional()
});
function serializeExpense(expense) {
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
expensesRouter.use(authenticated_1.authenticated);
expensesRouter.get('/', async (req, res, next) => {
    try {
        const expenses = (await prisma_1.prisma.expense.findMany({
            where: { property: { userId: req.userId } },
            include: { property: { select: { id: true, name: true } } },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }]
        }));
        res.json(expenses.map(serializeExpense));
    }
    catch (error) {
        next(error);
    }
});
expensesRouter.post('/', async (req, res, next) => {
    try {
        const data = expenseBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id: data.propertyId, userId: req.userId }
        });
        if (!property) {
            return res.status(404).json({ error: "Immeuble introuvable." });
        }
        const expense = (await prisma_1.prisma.expense.create({
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
        }));
        res.status(201).json(serializeExpense(expense));
    }
    catch (error) {
        next(error);
    }
});
expensesRouter.get('/export/fiscal', async (req, res, next) => {
    try {
        const { year: parsedYear, format } = fiscalExportQuerySchema.parse(req.query);
        const year = parsedYear ?? new Date().getFullYear();
        const report = await (0, expensesFiscalReport_1.buildExpensesFiscalReport)(req.userId, year);
        if (format === 'csv') {
            const csv = (0, expensesFiscalReport_1.expensesFiscalReportToCsv)(report);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="nowis-depenses-fiscales-${year}.csv"`);
            res.send(`\uFEFF${csv}`);
            return;
        }
        res.json(report);
    }
    catch (error) {
        next(error);
    }
});
expensesRouter.put('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = expenseBodySchema.parse(req.body);
        const existing = await prisma_1.prisma.expense.findFirst({
            where: { id, property: { userId: req.userId } }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Dépense introuvable.' });
        }
        const property = await prisma_1.prisma.property.findFirst({
            where: { id: data.propertyId, userId: req.userId }
        });
        if (!property) {
            return res.status(404).json({ error: "Immeuble introuvable." });
        }
        const expense = (await prisma_1.prisma.expense.update({
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
        }));
        res.json(serializeExpense(expense));
    }
    catch (error) {
        next(error);
    }
});
expensesRouter.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const deleted = await prisma_1.prisma.expense.deleteMany({
            where: { id, property: { userId: req.userId } }
        });
        if (deleted.count === 0) {
            return res.status(404).json({ error: 'Dépense introuvable.' });
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
