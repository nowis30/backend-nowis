import { spawn } from 'child_process';

import { logger } from '../server/lib/logger';

function getCommand(binary: string): string {
  return process.platform === 'win32' ? `${binary}.cmd` : binary;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  try {
    logger.info('Applying Prisma migrations before starting the API...');
    const npx = getCommand('npx');
    await runCommand(npx, ['prisma', 'migrate', 'deploy']);
    logger.info('Prisma migrations applied successfully. Launching API server...');
  } catch (error) {
    logger.error({ err: error }, 'Failed to apply Prisma migrations. Aborting launch.');
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../index');
}

void main();
