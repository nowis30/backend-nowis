import { prisma } from '../server/lib/prisma';

async function resolveUserId(): Promise<number> {
  const envUserId = process.env.USER_ID ? Number(process.env.USER_ID) : undefined;
  if (envUserId && Number.isFinite(envUserId)) return envUserId;

  const email = process.env.USER_EMAIL;
  if (!email) {
    console.error('Veuillez fournir USER_ID ou USER_EMAIL');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Utilisateur introuvable pour USER_EMAIL=${email}`);
    process.exit(1);
  }
  return user.id;
}

async function upsertRule(userId: number, name: string, data: {
  description?: string;
  isActive?: boolean;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  triggerType: string;
  condition: unknown;
}) {
  const existing = await (prisma as any).alertRule.findFirst({ where: { userId, name } });
  if (existing) {
    await (prisma as any).alertRule.update({
      where: { id: existing.id },
      data
    });
    return existing.id as number;
  }
  const created = await (prisma as any).alertRule.create({
    data: { userId, name, ...data }
  });
  return created.id as number;
}

async function main() {
  const userId = await resolveUserId();

  const rules = [
    {
      name: 'Health check failures',
      description: 'Surveille /health et alerte en cas d\'échecs consécutifs.',
      isActive: true,
      severity: 'WARNING' as const,
      triggerType: 'HEALTH_CHECK',
      condition: { path: '/health', expectedStatus: 200, timeoutMs: 5000, retries: 2 }
    },
    {
      name: 'Leverage simulation errors',
      description: 'Détecte les erreurs 5xx/4xx répétées sur /api/leverage/simulate.',
      isActive: true,
      severity: 'CRITICAL' as const,
      triggerType: 'LEVERAGE_ERROR',
      condition: { route: '/api/leverage/simulate', threshold: 3, windowMinutes: 10 }
    },
    {
      name: 'Slow requests',
      description: 'Alerte si les requêtes dépassent 2s (moyenne mobile).',
      isActive: true,
      severity: 'WARNING' as const,
      triggerType: 'SLOW_REQUEST',
      condition: { thresholdMs: 2000, sampleSize: 100 }
    }
  ];

  for (const r of rules) {
    const id = await upsertRule(userId, r.name, r);
    console.log(`Rule upserted: ${id} - ${r.name}`);
  }
}

main()
  .catch((err) => {
    console.error('Seed monitoring failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
