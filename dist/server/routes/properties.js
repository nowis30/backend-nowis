"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.propertiesRouter = void 0;
const fs_1 = __importDefault(require("fs"));
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const amortization_1 = require("../services/amortization");
const attachmentStorage_1 = require("../services/attachmentStorage");
const env_1 = require("../env");
const attachmentsExtractor_1 = require("../services/attachmentsExtractor");
const propertyOwnership_1 = require("../services/propertyOwnership");
const propertiesRouter = (0, express_1.Router)();
exports.propertiesRouter = propertiesRouter;
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB par fichier
    }
});
const optionalNumber = zod_1.z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
        return undefined;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? numeric : undefined;
}, zod_1.z.number().optional());
const optionalDate = zod_1.z.preprocess((value) => {
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
}, zod_1.z.date().optional());
const optionalTrimmedString = zod_1.z
    .preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
}, zod_1.z.string().trim().max(255))
    .optional();
const propertyBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    address: zod_1.z.string().optional(),
    acquisitionDate: optionalDate,
    purchasePrice: optionalNumber,
    currentValue: optionalNumber,
    notes: zod_1.z.string().optional()
});
const idParamSchema = zod_1.z.object({ id: zod_1.z.coerce.number() });
const nonNegativeNumber = zod_1.z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
        return 0;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? Math.max(0, Number(numeric)) : 0;
}, zod_1.z.number().nonnegative());
const depreciationBodySchema = zod_1.z.object({
    classCode: zod_1.z.string().min(1),
    ccaRate: nonNegativeNumber,
    openingUcc: nonNegativeNumber,
    additions: nonNegativeNumber,
    dispositions: nonNegativeNumber
});
const optionalNonNegativeNumber = zod_1.z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === 'string' && value.trim().length === 0) {
        return undefined;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? Math.max(0, Number(numeric)) : undefined;
}, zod_1.z.number().nonnegative().optional());
const positiveNumber = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? Math.max(0, Number(numeric)) : undefined;
}, zod_1.z.number().positive());
const boundedRate = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? Number(numeric) : undefined;
}, zod_1.z.number().min(0).max(1));
const positiveInt = zod_1.z.preprocess((value) => {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? Number(numeric) : undefined;
}, zod_1.z.number().int().positive());
const requiredDate = zod_1.z.preprocess((value) => {
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
}, zod_1.z.date());
const propertyUnitBodySchema = zod_1.z.object({
    label: zod_1.z.string().trim().min(1),
    squareFeet: optionalNonNegativeNumber,
    rentExpected: optionalNonNegativeNumber
});
const propertyUnitParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number(),
    unitId: zod_1.z.coerce.number()
});
const mortgageInputSchema = zod_1.z.object({
    lender: zod_1.z.string().trim().min(1),
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
const attachmentMetadataSchema = zod_1.z.object({
    title: optionalTrimmedString,
    mortgageId: zod_1.z
        .preprocess((value) => {
        if (value === '' || value === null || value === undefined) {
            return undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    }, positiveInt.optional())
});
const attachmentParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number(),
    attachmentId: zod_1.z.coerce.number()
});
const attachmentQuerySchema = zod_1.z.object({
    mortgageId: zod_1.z
        .preprocess((value) => {
        if (value === '' || value === null || value === undefined) {
            return undefined;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    }, positiveInt.optional())
});
const mortgageParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number(),
    mortgageId: zod_1.z.coerce.number()
});
function serializeUnit(unit) {
    return {
        id: unit.id,
        propertyId: unit.propertyId,
        label: unit.label,
        squareFeet: unit.squareFeet === null ? null : Number(unit.squareFeet),
        rentExpected: unit.rentExpected === null ? null : Number(unit.rentExpected ?? 0)
    };
}
function serializeMortgage(mortgage) {
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
function serializeAttachment(attachment) {
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
propertiesRouter.use(authenticated_1.authenticated);
propertiesRouter.get('/', async (req, res, next) => {
    try {
        const properties = await prisma_1.prisma.property.findMany({
            where: { userId: req.userId },
            include: {
                mortgages: true,
                revenues: true,
                expenses: true
            }
        });
        res.json(properties);
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/', async (req, res, next) => {
    try {
        const data = propertyBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.create({
            data: {
                userId: req.userId,
                name: data.name,
                address: data.address,
                acquisitionDate: data.acquisitionDate,
                purchasePrice: data.purchasePrice,
                currentValue: data.currentValue,
                notes: data.notes
            }
        });
        res.status(201).json(property);
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.put('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = propertyBodySchema.parse(req.body);
        const existing = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!existing) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const property = await prisma_1.prisma.property.update({
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
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        await prisma_1.prisma.property.deleteMany({ where: { id, userId: req.userId } });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/units', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const units = (await prisma_1.prisma.propertyUnit.findMany({
            where: { propertyId: id },
            orderBy: [{ label: 'asc' }, { id: 'asc' }]
        }));
        res.json(units.map(serializeUnit));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/units', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = propertyUnitBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const unit = (await prisma_1.prisma.propertyUnit.create({
            data: {
                propertyId: id,
                label: data.label,
                squareFeet: data.squareFeet ?? null,
                rentExpected: data.rentExpected ?? null
            }
        }));
        res.status(201).json(serializeUnit(unit));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.put('/:id/units/:unitId', async (req, res, next) => {
    try {
        const { id, unitId } = propertyUnitParamsSchema.parse(req.params);
        const data = propertyUnitBodySchema.parse(req.body);
        const existing = await prisma_1.prisma.propertyUnit.findFirst({
            where: { id: unitId, propertyId: id, property: { userId: req.userId } }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Unité introuvable.' });
        }
        const unit = (await prisma_1.prisma.propertyUnit.update({
            where: { id: unitId },
            data: {
                label: data.label,
                squareFeet: data.squareFeet ?? null,
                rentExpected: data.rentExpected ?? null
            }
        }));
        res.json(serializeUnit(unit));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.delete('/:id/units/:unitId', async (req, res, next) => {
    try {
        const { id, unitId } = propertyUnitParamsSchema.parse(req.params);
        const deleted = await prisma_1.prisma.propertyUnit.deleteMany({
            where: { id: unitId, propertyId: id, property: { userId: req.userId } }
        });
        if (deleted.count === 0) {
            return res.status(404).json({ error: 'Unité introuvable.' });
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/mortgages', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const mortgages = (await prisma_1.prisma.mortgage.findMany({
            where: { propertyId: id },
            orderBy: [{ createdAt: 'desc' }]
        }));
        res.json(mortgages.map(serializeMortgage));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/mortgages/preview', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = mortgagePreviewSchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const analysis = (0, amortization_1.buildAmortizationSchedule)({
            principal: data.principal,
            rateAnnual: data.rateAnnual,
            amortizationMonths: data.amortizationMonths,
            paymentFrequency: data.paymentFrequency,
            startDate: data.startDate,
            termMonths: data.termMonths,
            paymentAmount: undefined
        });
        res.json(analysis);
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/attachments', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const query = attachmentQuerySchema.parse(req.query);
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const attachments = (await prisma_1.prisma.attachment.findMany({
            where: {
                propertyId: id,
                mortgageId: query.mortgageId ?? undefined
            },
            orderBy: [{ createdAt: 'desc' }]
        }));
        res.json(attachments.map(serializeAttachment));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/attachments', upload.single('file'), async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const metadata = attachmentMetadataSchema.parse(req.body ?? {});
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier requis.' });
        }
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        let mortgageId;
        if (metadata.mortgageId !== undefined) {
            const mortgage = await prisma_1.prisma.mortgage.findFirst({
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
            const saved = await (0, attachmentStorage_1.saveAttachmentFile)({
                buffer: req.file.buffer,
                propertyId: id,
                originalName: req.file.originalname
            });
            storagePath = saved.storagePath;
            checksum = saved.checksum;
            filename = saved.filename;
        }
        catch (error) {
            return next(error);
        }
        try {
            const attachment = (await prisma_1.prisma.attachment.create({
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
            }));
            res.status(201).json(serializeAttachment(attachment));
        }
        catch (error) {
            await (0, attachmentStorage_1.deleteAttachmentFile)(storagePath);
            throw error;
        }
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/mortgages', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = mortgageBodySchema.parse(req.body);
        const paymentAmount = (0, amortization_1.calculateScheduledPayment)({
            principal: data.principal,
            rateAnnual: data.rateAnnual,
            amortizationMonths: data.amortizationMonths,
            paymentFrequency: data.paymentFrequency
        });
        const property = await prisma_1.prisma.property.findFirst({
            where: { id, userId: req.userId },
            select: { id: true }
        });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const mortgage = (await prisma_1.prisma.mortgage.create({
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
        }));
        res.status(201).json(serializeMortgage(mortgage));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.put('/:id/mortgages/:mortgageId', async (req, res, next) => {
    try {
        const { id, mortgageId } = mortgageParamsSchema.parse(req.params);
        const data = mortgageBodySchema.parse(req.body);
        const paymentAmount = (0, amortization_1.calculateScheduledPayment)({
            principal: data.principal,
            rateAnnual: data.rateAnnual,
            amortizationMonths: data.amortizationMonths,
            paymentFrequency: data.paymentFrequency
        });
        const existing = await prisma_1.prisma.mortgage.findFirst({
            where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Hypothèque introuvable.' });
        }
        const mortgage = (await prisma_1.prisma.mortgage.update({
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
        }));
        res.json(serializeMortgage(mortgage));
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
    try {
        const { id, attachmentId } = attachmentParamsSchema.parse(req.params);
        const attachment = (await prisma_1.prisma.attachment.findFirst({
            where: {
                id: attachmentId,
                propertyId: id,
                property: { userId: req.userId }
            }
        }));
        if (!attachment) {
            return res.status(404).json({ error: 'Pièce jointe introuvable.' });
        }
        const filePath = (0, attachmentStorage_1.resolveAttachmentPath)(attachment.storagePath);
        try {
            await fs_1.default.promises.access(filePath);
        }
        catch {
            return res.status(410).json({ error: 'Fichier indisponible.' });
        }
        res.setHeader('Content-Type', attachment.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
        const stream = fs_1.default.createReadStream(filePath);
        stream.on('error', next);
        stream.pipe(res);
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/attachments/:attachmentId/extract', async (req, res, next) => {
    try {
        const { id, attachmentId } = attachmentParamsSchema.parse(req.params);
        const attachment = (await prisma_1.prisma.attachment.findFirst({
            where: {
                id: attachmentId,
                propertyId: id,
                property: { userId: req.userId }
            }
        }));
        if (!attachment) {
            return res.status(404).json({ error: 'Pièce jointe introuvable.' });
        }
        if (!env_1.env.OPENAI_API_KEY) {
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
        const result = await (0, attachmentsExtractor_1.extractExpenseFromAttachment)(attachment.storagePath, ct);
        const autoCreateRaw = Array.isArray(req.query.autoCreate)
            ? req.query.autoCreate[0]
            : req.query.autoCreate;
        const normalizedFlag = typeof autoCreateRaw === 'string'
            ? autoCreateRaw.toLowerCase().trim()
            : '';
        const shouldCreate = ['1', 'true', 'yes'].includes(normalizedFlag);
        let createdExpenseId = null;
        if (shouldCreate &&
            result.label &&
            result.amount > 0 &&
            /^\d{4}-\d{2}-\d{2}$/.test(result.startDate)) {
            const createdExpense = await prisma_1.prisma.expense.create({
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
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/mortgages/:mortgageId/amortization', async (req, res, next) => {
    try {
        const { id, mortgageId } = mortgageParamsSchema.parse(req.params);
        const mortgage = await prisma_1.prisma.mortgage.findFirst({
            where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
        });
        if (!mortgage) {
            return res.status(404).json({ error: 'Hypothèque introuvable.' });
        }
        const analysis = (0, amortization_1.buildAmortizationSchedule)({
            principal: mortgage.principal,
            rateAnnual: mortgage.rateAnnual,
            amortizationMonths: mortgage.amortizationMonths,
            paymentFrequency: mortgage.paymentFrequency,
            startDate: mortgage.startDate,
            termMonths: mortgage.termMonths,
            paymentAmount: mortgage.paymentAmount
        });
        res.json({
            mortgage: serializeMortgage(mortgage),
            analysis
        });
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.delete('/:id/mortgages/:mortgageId', async (req, res, next) => {
    try {
        const { id, mortgageId } = mortgageParamsSchema.parse(req.params);
        const deleted = await prisma_1.prisma.mortgage.deleteMany({
            where: { id: mortgageId, propertyId: id, property: { userId: req.userId } }
        });
        if (deleted.count === 0) {
            return res.status(404).json({ error: 'Hypothèque introuvable.' });
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.delete('/:id/attachments/:attachmentId', async (req, res, next) => {
    try {
        const { id, attachmentId } = attachmentParamsSchema.parse(req.params);
        const attachment = (await prisma_1.prisma.attachment.findFirst({
            where: {
                id: attachmentId,
                propertyId: id,
                property: { userId: req.userId }
            }
        }));
        if (!attachment) {
            return res.status(404).json({ error: 'Pièce jointe introuvable.' });
        }
        await prisma_1.prisma.attachment.delete({ where: { id: attachment.id } });
        await (0, attachmentStorage_1.deleteAttachmentFile)(attachment.storagePath);
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.get('/:id/depreciation', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({
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
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.put('/:id/depreciation', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const data = depreciationBodySchema.parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!property) {
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        }
        const depreciation = await prisma_1.prisma.depreciationSetting.upsert({
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
    }
    catch (error) {
        next(error);
    }
});
// ---- Co‑propriété et simulations ----
const ownershipEntrySchema = zod_1.z.object({
    shareholderId: zod_1.z.coerce.number().int().positive(),
    ownershipPercent: zod_1.z.coerce.number().min(0).max(100),
    priorityReturnCap: optionalNonNegativeNumber,
    notes: zod_1.z.string().trim().optional()
});
propertiesRouter.get('/:id/ownership', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!property)
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        const owners = await prisma_1.prisma.propertyCoOwner.findMany({ where: { propertyId: id }, orderBy: [{ shareholderId: 'asc' }] });
        const normalized = owners.map((o) => ({
            id: o.id,
            shareholderId: o.shareholderId,
            ownershipPercent: Number(o.ownershipPercent ?? 0),
            priorityReturnCap: o.priorityReturnCap == null ? null : Number(o.priorityReturnCap),
            notes: o.notes ?? null,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt
        }));
        const sumPct = normalized.reduce((s, o) => s + (o.ownershipPercent || 0), 0);
        res.json({ owners: normalized, sumPercent: sumPct });
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.put('/:id/ownership', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const body = zod_1.z.object({ owners: zod_1.z.array(ownershipEntrySchema).min(1) }).parse(req.body);
        const property = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!property)
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        const sum = body.owners.reduce((s, o) => s + o.ownershipPercent, 0);
        if (Math.abs(sum - 100) > 0.05) {
            return res.status(400).json({ error: 'La somme des pourcentages doit être proche de 100%.' });
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.propertyCoOwner.deleteMany({ where: { propertyId: id } }),
            ...(body.owners.map((o) => (prisma_1.prisma.propertyCoOwner.create({
                data: {
                    propertyId: id,
                    shareholderId: o.shareholderId,
                    ownershipPercent: o.ownershipPercent,
                    priorityReturnCap: o.priorityReturnCap ?? null,
                    notes: o.notes ?? null
                }
            }))))
        ]);
        const owners = await prisma_1.prisma.propertyCoOwner.findMany({ where: { propertyId: id }, orderBy: [{ shareholderId: 'asc' }] });
        res.json({ owners });
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/simulations/distribute-cashflow', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!property)
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        const payload = zod_1.z.object({
            periodStart: optionalDate,
            periodEnd: optionalDate,
            includeMortgagePayments: zod_1.z.coerce.boolean().optional()
        }).parse(req.body ?? {});
        const result = await (0, propertyOwnership_1.computePropertyDistribution)({
            propertyId: id,
            periodStart: payload.periodStart,
            periodEnd: payload.periodEnd,
            includeMortgagePayments: payload.includeMortgagePayments ?? false
        });
        res.json(result);
    }
    catch (error) {
        next(error);
    }
});
propertiesRouter.post('/:id/simulations/event', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const property = await prisma_1.prisma.property.findFirst({ where: { id, userId: req.userId } });
        if (!property)
            return res.status(404).json({ error: 'Immeuble introuvable.' });
        const payload = zod_1.z.object({
            eventType: zod_1.z.enum(['SALE', 'REFINANCE']),
            value: zod_1.z.coerce.number().positive(),
            closingCosts: optionalNonNegativeNumber,
            debtOutstanding: optionalNonNegativeNumber
        }).parse(req.body);
        const result = await (0, propertyOwnership_1.simulateSaleOrRefi)({
            propertyId: id,
            eventType: payload.eventType,
            value: payload.value,
            closingCosts: payload.closingCosts ?? 0,
            debtOutstanding: payload.debtOutstanding ?? undefined
        });
        res.json(result);
    }
    catch (error) {
        next(error);
    }
});
