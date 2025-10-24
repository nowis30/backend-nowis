"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRolesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const requireRole_1 = require("../middlewares/requireRole");
const router = (0, express_1.Router)();
const idParamSchema = zod_1.z.object({
    id: zod_1.z.coerce.number().int().positive()
});
const userRoleSchema = zod_1.z.object({
    userId: zod_1.z.coerce.number().int().positive(),
    roleId: zod_1.z.coerce.number().int().positive(),
    companyId: zod_1.z
        .union([zod_1.z.coerce.number().int().positive(), zod_1.z.null()])
        .optional()
});
router.use(authenticated_1.authenticated);
router.use((0, requireRole_1.requireRole)('ADMIN'));
router.get('/', async (_req, res, next) => {
    try {
        const userRoles = await prisma_1.prisma.userRole.findMany({
            include: { user: true, role: true, company: true },
            orderBy: [{ user: { email: 'asc' } }, { role: { name: 'asc' } }]
        });
        res.json(userRoles);
    }
    catch (error) {
        next(error);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const body = userRoleSchema.parse(req.body);
        const created = await prisma_1.prisma.userRole.create({
            data: { userId: body.userId, roleId: body.roleId, companyId: body.companyId ?? null },
            include: { user: true, role: true, company: true }
        });
        res.status(201).json(created);
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        const body = userRoleSchema.parse(req.body);
        const updated = await prisma_1.prisma.userRole.update({
            where: { id },
            data: { userId: body.userId, roleId: body.roleId, companyId: body.companyId ?? null },
            include: { user: true, role: true, company: true }
        });
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = idParamSchema.parse(req.params);
        await prisma_1.prisma.userRole.delete({ where: { id } });
        res.sendStatus(204);
    }
    catch (error) {
        next(error);
    }
});
exports.userRolesRouter = router;
