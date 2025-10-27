import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { buildFamilyWealthOverview } from '../services/wealth/familyWealthService';

export interface WealthSnapshotJobOptions {
  intervalMinutes: number;
  runOnStart?: boolean;
}

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

function parseError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  try {
    return { name: 'Error', message: JSON.stringify(error) };
  } catch (serializationError) {
    return {
      name: 'Error',
      message: serializationError instanceof Error ? serializationError.message : String(error)
    };
  }
}

export async function runWealthSnapshotCycle(): Promise<void> {
  if (isRunning) {
    logger.warn({ job: 'wealthSnapshot' }, 'Skipping wealth snapshot cycle because previous run is still executing');
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  try {
    const users = await prisma.user.findMany({ select: { id: true } });

    logger.info({ job: 'wealthSnapshot', userCount: users.length }, 'Starting wealth snapshot cycle');

    for (const user of users) {
      try {
        await buildFamilyWealthOverview(user.id, { persistSnapshot: true });
        logger.debug({ job: 'wealthSnapshot', userId: user.id }, 'Snapshot persisted');
      } catch (error) {
        const parsed = parseError(error);
        logger.error({ job: 'wealthSnapshot', userId: user.id, error: parsed }, 'Failed to persist wealth snapshot for user');
      }
    }

    const durationMs = Date.now() - startedAt;
    logger.info({ job: 'wealthSnapshot', userCount: users.length, durationMs }, 'Completed wealth snapshot cycle');
  } catch (error) {
    const parsed = parseError(error);
    logger.error({ job: 'wealthSnapshot', error: parsed }, 'Wealth snapshot cycle aborted due to unexpected error');
  } finally {
    isRunning = false;
  }
}

export function startWealthSnapshotJob(options: WealthSnapshotJobOptions): void {
  if (timer) {
    logger.warn({ job: 'wealthSnapshot' }, 'Wealth snapshot job already running, ignoring start request');
    return;
  }

  const intervalMs = Math.max(options.intervalMinutes, 1) * 60 * 1000;

  timer = setInterval(() => {
    void runWealthSnapshotCycle();
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  logger.info({ job: 'wealthSnapshot', intervalMinutes: options.intervalMinutes }, 'Wealth snapshot scheduler started');

  if (options.runOnStart !== false) {
    void runWealthSnapshotCycle();
  }
}

export function stopWealthSnapshotJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info({ job: 'wealthSnapshot' }, 'Wealth snapshot scheduler stopped');
  }
}

export function isWealthSnapshotJobRunning(): boolean {
  return isRunning;
}
