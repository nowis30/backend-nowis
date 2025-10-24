import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { authenticated } from '../middlewares/authenticated';
import { requireRole } from '../middlewares/requireRole';

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  return Number(value);
}

const router = Router();

router.use(authenticated);

router.get('/overview', requireRole('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      usersCount,
      companiesCount,
      propertiesCount,
      totalRevenue,
      totalExpenses,
      roles,
      statements,
      resolutions,
      recentStatements,
      recentResolutions
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.company.count(),
      prisma.property.count(),
      prisma.revenue.aggregate({ _sum: { amount: true } }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.role.findMany({
        include: {
          users: true
        },
        orderBy: { name: 'asc' }
      }),
      prisma.corporateStatement.aggregate({ _count: true }),
      prisma.corporateResolution.aggregate({ _count: true }),
      prisma.corporateStatement.findMany({
        include: {
          company: { select: { id: true, name: true } }
        },
        orderBy: [{ periodEnd: 'desc' }],
        take: 5
      }),
      prisma.corporateResolution.findMany({
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
        type: 'STATEMENT' as const,
        id: statement.id,
        companyId: statement.companyId,
        companyName: statement.company?.name ?? 'Société inconnue',
        date: statement.periodEnd.toISOString(),
        label: `${statement.statementType}`
      })),
      ...recentResolutions.map((resolution) => ({
        type: 'RESOLUTION' as const,
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
  } catch (error) {
    next(error);
  }
});

export const reportsRouter = router;
