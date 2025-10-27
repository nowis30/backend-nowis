import { spawn } from 'child_process';

import { logger } from './logger';

function getCommand(binary: string): string {
  return process.platform === 'win32' ? `${binary}.cmd` : binary;
}

export async function runMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === '1') {
    logger.info('Skipping DB migrations due to SKIP_DB_MIGRATIONS=1');
    return;
  }
  const npx = getCommand('npx');
  logger.info('Applying Prisma migrations (deploy) before server start...');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npx, ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with code ${code}`));
    });
  });
  logger.info('Prisma migrations applied successfully.');
}
