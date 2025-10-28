import { createServer } from 'http';

import { app } from './server/app';
import { env } from './server/env';
import { startWealthSnapshotJob } from './server/jobs/wealthSnapshotJob';
import { logger } from './server/lib/logger';
import { runMigrations } from './server/lib/runMigrations';
import { startMonitoringJobs } from './server/jobs/monitoringJobs';

// Render (et la plupart des PaaS) fournissent une variable d'env PORT et
// exigent que l'application écoute sur 0.0.0.0 à ce port.
async function main() {
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, 'Failed to apply Prisma migrations at startup');
    process.exit(1);
  }

  const server = createServer(app);
  const port = env.PORT;
  const host = '0.0.0.0';

  server.listen(port, host, () => {
    logger.info({ host, port }, 'API Nowis démarrée');

    if (env.ENABLE_WEALTH_SNAPSHOT_JOB) {
      startWealthSnapshotJob({
        intervalMinutes: env.WEALTH_SNAPSHOT_INTERVAL_MINUTES,
        runOnStart: true
      });
    }

    // Optional monitoring jobs (health checks)
    startMonitoringJobs();
  });
}

void main();
