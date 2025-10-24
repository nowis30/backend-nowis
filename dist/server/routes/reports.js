"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const authenticated_1 = require("../middlewares/authenticated");
const requireRole_1 = require("../middlewares/requireRole");
function decimalToNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (value instanceof client_1.Prisma.Decimal) {
        return value.toNumber();
    }
    return Number(value);
}
const router = (0, express_1.Router)();
router.use(authenticated_1.authenticated);
router.get('/overview', (0, requireRole_1.requireRole)('ADMIN'), async (_req, res, next) => {
    try {
        const [usersCount, companiesCount, propertiesCount, totalRevenue, totalExpenses, roles, statements, resolutions, recentStatements, recentResolutions] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.user.count(),
            prisma_1.prisma.company.count(),
            prisma_1.prisma.property.count(),
            prisma_1.prisma.revenue.aggregate({ _sum: { amount: true } }),
            prisma_1.prisma.expense.aggregate({ _sum: { amount: true } }),
            prisma_1.prisma.role.findMany({
                include: {
                    users: true
                },
                orderBy: { name: 'asc' }
            }),
            prisma_1.prisma.corporateStatement.aggregate({ _count: true }),
            prisma_1.prisma.corporateResolution.aggregate({ _count: true }),
            prisma_1.prisma.corporateStatement.findMany({
                include: {
                    company: { select: { id: true, name: true } }
                },
                orderBy: [{ periodEnd: 'desc' }],
                take: 5
            }),
            prisma_1.prisma.corporateResolution.findMany({
                include: {
                    company: { select: { id: true, name: true } }
                },
                orderBy: [{ resolutionDate: 'desc' }],
                take: 5
            })
        ]);
        const roleDistribution = roles.map((role) => ({
            roleId: role.id,
            roleName: role.name,
            assignments: role.users.length
        }));
        const topCompaniesByEquity = recentStatements
            .map((statement) => ({
            companyId: statement.companyId,
            companyName: statement.company?.name ?? 'Société inconnue',
            periodEnd: statement.periodEnd.toISOString(),
            totalEquity: decimalToNumber(statement.totalEquity),
            netIncome: decimalToNumber(statement.netIncome)
        }))
            .slice(0, 5);
        const activityTimeline = [
            ...recentStatements.map((statement) => ({
                type: 'STATEMENT',
                id: statement.id,
                companyId: statement.companyId,
                companyName: statement.company?.name ?? 'Société inconnue',
                date: statement.periodEnd.toISOString(),
                label: `${statement.statementType}`
            })),
            ...recentResolutions.map((resolution) => ({
                type: 'RESOLUTION',
                id: resolution.id,
                companyId: resolution.companyId,
                companyName: resolution.company?.name ?? 'Société inconnue',
                date: resolution.resolutionDate.toISOString(),
                label: resolution.title
            }))
        ].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
        res.json({
            generatedAt: new Date().toISOString(),
            totals: {
                users: usersCount,
                companies: companiesCount,
                properties: propertiesCount,
                revenue: decimalToNumber(totalRevenue._sum.amount),
                expenses: decimalToNumber(totalExpenses._sum.amount),
                statements: statements._count,
                resolutions: resolutions._count
            },
            roles: roleDistribution,
            topCompaniesByEquity,
            recentActivity: activityTimeline
        });
    }
    catch (error) {
        next(error);
    }
});
exports.reportsRouter = router;
