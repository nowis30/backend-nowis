"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const requireRole_1 = require("../middlewares/requireRole");
const passwordSchema = zod_1.z
    .string()
    .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
    .regex(/[A-Z]/, 'Inclure au moins une lettre majuscule.')
    .regex(/[a-z]/, 'Inclure au moins une lettre minuscule.')
    .regex(/[0-9]/, 'Inclure au moins un chiffre.')
    .regex(/[^A-Za-z0-9]/, 'Inclure au moins un caractère spécial.');
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: passwordSchema,
    roles: zod_1.z
        .array(zod_1.z.object({
        roleId: zod_1.z.coerce.number().int().positive(),
        companyId: zod_1.z.union([zod_1.z.coerce.number().int().positive(), zod_1.z.null()]).optional()
    }))
        .default([])
});
function serializeUser(user) {
    return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        roles: user.roles.map((assignment) => ({
            id: assignment.id,
            roleId: assignment.role.id,
            roleName: assignment.role.name,
            companyId: assignment.company?.id ?? null,
            companyName: assignment.company?.name ?? null
        }))
    };
}
const router = (0, express_1.Router)();
router.use(authenticated_1.authenticated);
router.use((0, requireRole_1.requireRole)('ADMIN'));
router.get('/', async (_req, res, next) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            include: {
                roles: {
                    include: {
                        role: true,
                        company: { select: { id: true, name: true } }
                    }
                }
            },
            orderBy: { email: 'asc' }
        });
        res.json(users.map(serializeUser));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const payload = createUserSchema.parse(req.body);
        const passwordHash = await bcrypt_1.default.hash(payload.password, 12);
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({ where: { email: payload.email } });
            if (existing) {
                throw Object.assign(new Error('Utilisateur déjà existant.'), { status: 409 });
            }
            const createdUser = await tx.user.create({
                data: {
                    email: payload.email,
                    passwordHash
                }
            });
            if (payload.roles.length > 0) {
                for (const assignment of payload.roles) {
                    await tx.userRole.create({
                        data: {
                            userId: createdUser.id,
                            roleId: assignment.roleId,
                            companyId: assignment.companyId ?? null
                        }
                    });
                }
            }
            return createdUser.id;
        });
        const user = await prisma_1.prisma.user.findUniqueOrThrow({
            where: { id: result },
            include: {
                roles: {
                    include: {
                        role: true,
                        company: { select: { id: true, name: true } }
                    }
                }
            }
        });
        res.status(201).json(serializeUser(user));
    }
    catch (error) {
        next(error);
    }
});
exports.usersRouter = router;
