import { createServer } from 'http';

import { app } from './server/app';
import { env } from './server/env';
import { startWealthSnapshotJob } from './server/jobs/wealthSnapshotJob';
import { logger } from './server/lib/logger';

// Render (et la plupart des PaaS) fournissent une variable d'env PORT et
// exigent que l'application écoute sur 0.0.0.0 à ce port.
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
});
