"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const app_1 = require("./server/app");
const env_1 = require("./server/env");
const wealthSnapshotJob_1 = require("./server/jobs/wealthSnapshotJob");
const logger_1 = require("./server/lib/logger");
const runMigrations_1 = require("./server/lib/runMigrations");
const monitoringJobs_1 = require("./server/jobs/monitoringJobs");
const registerComputes_1 = require("./server/services/dag/registerComputes");
// Render (et la plupart des PaaS) fournissent une variable d'env PORT et
// exigent que l'application écoute sur 0.0.0.0 à ce port.
async function main() {
    try {
        await (0, runMigrations_1.runMigrations)();
    }
    catch (err) {
        logger_1.logger.error({ err }, 'Failed to apply Prisma migrations at startup');
        process.exit(1);
    }
    const server = (0, http_1.createServer)(app_1.app);
    const port = env_1.env.PORT;
    const host = '0.0.0.0';
    // Enregistrer les compute functions DAG réelles au démarrage de l'app
    (0, registerComputes_1.registerDagComputes)();
    server.listen(port, host, () => {
        logger_1.logger.info({ host, port }, 'API Nowis démarrée');
        if (env_1.env.ENABLE_WEALTH_SNAPSHOT_JOB) {
            (0, wealthSnapshotJob_1.startWealthSnapshotJob)({
                intervalMinutes: env_1.env.WEALTH_SNAPSHOT_INTERVAL_MINUTES,
                runOnStart: true
            });
        }
        // Optional monitoring jobs (health checks)
        (0, monitoringJobs_1.startMonitoringJobs)();
    });
}
void main();
