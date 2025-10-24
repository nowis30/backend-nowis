"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const prisma_1 = require("../lib/prisma");
function requireRole(roleName) {
    return async (req, res, next) => {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Utilisateur non authentifié.' });
        }
        // Vérifie si l'utilisateur a le rôle demandé (global ou pour une company)
        const userRoles = await prisma_1.prisma.userRole.findMany({
            where: {
                userId,
                role: { name: roleName }
            }
        });
        if (userRoles.length === 0) {
            return res.status(403).json({ error: `Accès refusé, rôle requis : ${roleName}` });
        }
        next();
    };
}
