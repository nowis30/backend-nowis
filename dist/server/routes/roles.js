"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rolesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const requireRole_1 = require("../middlewares/requireRole");
const roleSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .trim()
        .min(1, 'Le nom du rôle est requis.')
});
const idParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive()
});
const router = (0, express_1.Router)();
router.use(authenticated_1.authenticated);
router.use((0, requireRole_1.requireRole)('ADMIN'));
router.get('/', async (_req, res, next) => {
    try {
        const roles = await prisma_1.prisma.role.findMany({ orderBy: { name: 'asc' } });
        res.json(roles);
    }
    catch (error) {
        next(error);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const body = roleSchema.parse(req.body);
        const role = await prisma_1.prisma.role.create({ data: { name: body.name } });
        res.status(201).json(role);
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const body = roleSchema.parse(req.body);
        const role = await prisma_1.prisma.role.update({ where: { id }, data: { name: body.name } });
        res.json(role);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        await prisma_1.prisma.role.delete({ where: { id } });
        res.sendStatus(204);
    }
    catch (error) {
        next(error);
    }
});
exports.rolesRouter = router;
