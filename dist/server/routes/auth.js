"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const env_1 = require("../env");
const authRouter = (0, express_1.Router)();
exports.authRouter = authRouter;
const passwordSchema = zod_1.z
    .string()
    .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
    .regex(/[A-Z]/, 'Inclure au moins une lettre majuscule.')
    .regex(/[a-z]/, 'Inclure au moins une lettre minuscule.')
    .regex(/[0-9]/, 'Inclure au moins un chiffre.')
    .regex(/[^A-Za-z0-9]/, 'Inclure au moins un caractère spécial.');
// Accepte les emails standards et les domaines internes (.local) utilisés par le seed
const emailSchema = zod_1.z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || /@[^@\s]+\.local$/i.test(value), { message: 'Email invalide.' });
const credentialsSchema = zod_1.z.object({
    email: emailSchema,
    password: passwordSchema
});
function createToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '7d' });
}
authRouter.post('/register', async (req, res, next) => {
    try {
        const credentials = credentialsSchema.parse(req.body);
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: credentials.email } });
        if (existing) {
            return res.status(409).json({ error: 'Utilisateur déjà inscrit.' });
        }
        const passwordHash = await bcrypt_1.default.hash(credentials.password, 12);
        const user = await prisma_1.prisma.user.create({
            data: { email: credentials.email, passwordHash }
        });
        const token = createToken(user.id);
        res.status(201).json({ token });
    }
    catch (error) {
        next(error);
    }
});
authRouter.post('/login', async (req, res, next) => {
    try {
        const credentials = credentialsSchema.parse(req.body);
        const user = await prisma_1.prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user) {
            return res.status(401).json({ error: 'Identifiants invalides.' });
        }
        const ok = await bcrypt_1.default.compare(credentials.password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ error: 'Identifiants invalides.' });
        }
        const token = createToken(user.id);
        res.json({ token });
    }
    catch (error) {
        next(error);
    }
});
const tokenPayloadSchema = zod_1.z.object({
    userId: zod_1.z.number()
});
authRouter.get('/me', async (req, res) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).json({ error: 'Token absent.' });
    }
    const token = authorization.replace('Bearer ', '');
    try {
        const payload = tokenPayloadSchema.parse(jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET));
        const user = await prisma_1.prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable.' });
        }
        res.json({ id: user.id, email: user.email });
    }
    catch (error) {
        res.status(401).json({ error: 'Token invalide.' });
    }
});
