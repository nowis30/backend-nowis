import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { prisma } from '../server/lib/prisma';
import { buildProfileProjection } from '../server/services/profileProjectionService';
import { getProfileSummary } from '../server/services/profileSummaryService';
import { purgeUsersByEmails, purgeUsersByIds } from './helpers/prismaCleanup';

describe('buildProfileProjection', () => {
  jest.setTimeout(15000);

  const email = 'projection-unit@nowis.local';
  let userId: number;

  beforeAll(async () => {
    await purgeUsersByEmails(email);
    const user = await prisma.user.create({ data: { email, passwordHash: 'irrelevant' } });
    userId = user.id;

    // Un minimum de données pour la synthèse du profil
    await prisma.personalAsset.create({
      data: {
        userId,
        label: 'Dépôt de base',
        category: 'LIQUID',
        valuation: 10000,
        valuationDate: new Date('2025-01-01'),
        ownerType: 'PERSONAL'
      }
    });

    await prisma.personalExpense.create({
      data: {
        userId,
        label: 'Dépenses mensuelles',
        category: 'LIFESTYLE',
        amount: 2500,
        frequency: 'MONTHLY',
        essential: true
      }
    });
  });

  afterAll(async () => {
    await purgeUsersByIds(userId);
  });

  it('produit une timeline et des hypothèses cohérentes', async () => {
    const summary = await getProfileSummary(userId);

    const projection = await buildProfileProjection(userId, {
      summary,
      // Pas d\'historique riche: le service doit retomber sur des hypothèses par défaut stables
      referenceDate: new Date('2025-01-01')
    });

    expect(Array.isArray(projection.timeline)).toBe(true);
    expect(projection.timeline.length).toBe(12);
    expect(typeof projection.assumptions.baselineNetWorth).toBe('number');
    expect(typeof projection.assumptions.averageMonthlyChange).toBe('number');
    expect(typeof projection.assumptions.averageMonthlyGrowthRate).toBe('number');
    expect(typeof projection.assumptions.monthlyExpenses).toBe('number');
    expect(Array.isArray(projection.notes)).toBe(true);
    expect(projection.notes.length).toBeGreaterThan(0);
  });
});
