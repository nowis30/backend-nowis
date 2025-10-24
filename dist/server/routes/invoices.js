"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoicesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const invoicesRouter = (0, express_1.Router)();
exports.invoicesRouter = invoicesRouter;
const dateFromInput = zod_1.z.preprocess((value) => {
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
}, zod_1.z.date());
const invoiceBodySchema = zod_1.z.object({
    propertyId: zod_1.z.number(),
    invoiceDate: dateFromInput,
    supplier: zod_1.z.string().min(1),
    amount: zod_1.z.number(),
    category: zod_1.z.string().min(1),
    gst: zod_1.z.number().optional(),
    qst: zod_1.z.number().optional(),
    description: zod_1.z.string().optional()
});
const idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number() });
invoicesRouter.use(authenticated_1.authenticated);
invoicesRouter.get('/', async (req, res, next) => {
    try {
        const propertyId = req.query.propertyId ? Number(req.query.propertyId) : undefined;
        const filters = propertyId
            ? { propertyId, property: { userId: req.userId } }
            : { property: { userId: req.userId } };
        const invoices = await prisma_1.prisma.invoice.findMany({
            where: filters,
            include: { property: { select: { name: true } }, items: true }
        });
        res.json(invoices);
    }
    catch (error) {
        next(error);
    }
});
invoicesRouter.post('/', async (req, res, next) => {
    try {
        const data = invoiceBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id: data.propertyId, userId: req.userId }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const invoice = await prisma_1.prisma.invoice.create({
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
    }
    catch (error) {
        next(error);
    }
});
invoicesRouter.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        await prisma_1.prisma.invoice.deleteMany({
            where: { id, property: { userId: req.userId } }
        });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
