import { spawn } from 'child_process';

import { logger } from './logger';

const DEFAULT_RECOVERY_MIGRATION = '20251026103000_add_personal_income_table';

function getCommand(binary: string): string {
  return process.platform === 'win32' ? `${binary}.cmd` : binary;
}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], captureOutput = false): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      shell: false
    });

    let stdout = '';
    let stderr = '';

    if (captureOutput) {
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });
    }

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function runMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === '1') {
    logger.info('Skipping DB migrations due to SKIP_DB_MIGRATIONS=1');
    return;
  }

  const npx = getCommand('npx');
  const recoveryMigration = process.env.PRISMA_RECOVERY_MIGRATION || DEFAULT_RECOVERY_MIGRATION;

  logger.info({ recoveryMigration }, 'Checking Prisma migration status before server start...');

  const statusResult = await runCommand(npx, ['prisma', 'migrate', 'status'], true);
  const combinedOutput = `${statusResult.stdout}\n${statusResult.stderr}`.toLowerCase();
  const hasFailedMigration = combinedOutput.includes('p3009') || combinedOutput.includes('failed');
  const hasTargetFailure =
    hasFailedMigration && combinedOutput.includes(recoveryMigration.toLowerCase());

  if (hasTargetFailure) {
    logger.warn(
      { recoveryMigration },
      'Detected failed Prisma migration targeted for automatic rollback; resolving as rolled back before deploy.'
    );

    const resolveResult = await runCommand(npx, [
      'prisma',
      'migrate',
      'resolve',
      '--rolled-back',
      recoveryMigration
    ]);

    if (resolveResult.code !== 0) {
      throw new Error(`Failed to mark ${recoveryMigration} as rolled back.`);
    }
  } else if (hasFailedMigration) {
    throw new Error(
      `Prisma reported a failed migration other than ${recoveryMigration}. Automatic recovery stopped to avoid guessing.`
    );
  }

  logger.info('Applying Prisma migrations (deploy) before server start...');
  const deployResult = await runCommand(npx, ['prisma', 'migrate', 'deploy']);
  if (deployResult.code !== 0) {
    throw new Error('prisma migrate deploy exited with a non-zero code');
  }

  logger.info('Prisma migrations applied successfully.');
}
