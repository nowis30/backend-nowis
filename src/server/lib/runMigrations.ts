import { spawn } from 'child_process';

import { logger } from './logger';

const DEFAULT_RECOVERY_MIGRATION = '20251026103000_add_personal_income_table';
const MAX_RECOVERY_PASSES = 8;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeDatabaseUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  const normalized = stripWrappingQuotes(rawValue);
  return normalized.length > 0 ? normalized : undefined;
}

function ensureValidDatabaseUrl(): void {
  const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL);

  if (!normalized) {
    throw new Error('DATABASE_URL est manquante. Configurez-la dans Render (sans guillemets).');
  }

  if (!/^postgres(ql)?:\/\//i.test(normalized)) {
    throw new Error(
      `DATABASE_URL invalide (doit commencer par postgresql:// ou postgres://). Valeur actuelle: ${normalized.slice(0, 24)}...`
    );
  }

  process.env.DATABASE_URL = normalized;
}

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

function looksLikeForeignMigrationHistory(output: string): boolean {
  return (
    output.includes('your local migration history and the migrations table from your database are different') &&
    output.includes('the migrations from the database are not found locally in prisma/migrations')
  );
}

function extractDatabaseLabel(url: string | undefined): string {
  if (!url) return 'unknown';
  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname.replace(/^\//, '') || 'unknown-db';
    return `${parsed.hostname}/${dbName}`;
  } catch {
    return 'invalid-url';
  }
}

export async function runMigrations(): Promise<void> {
  if (process.env.SKIP_DB_MIGRATIONS === '1') {
    logger.info('Skipping DB migrations due to SKIP_DB_MIGRATIONS=1');
    return;
  }

  // Render peut contenir des guillemets entourants dans la valeur saisie au dashboard.
  // Prisma CLI échoue alors avec P1012; on normalise avant toute commande Prisma.
  ensureValidDatabaseUrl();

  const npx = getCommand('npx');
  const recoveryMigration = process.env.PRISMA_RECOVERY_MIGRATION || DEFAULT_RECOVERY_MIGRATION;

  for (let pass = 1; pass <= MAX_RECOVERY_PASSES; pass += 1) {
    logger.info({ recoveryMigration, pass, maxPasses: MAX_RECOVERY_PASSES }, 'Checking Prisma migration status before server start...');

    const statusResult = await runCommand(npx, ['prisma', 'migrate', 'status'], true);
    const statusOutput = `${statusResult.stdout}\n${statusResult.stderr}`.toLowerCase();
    const hasFailedMigration = statusOutput.includes('p3009') || statusOutput.includes('failed');
    const hasTargetFailure =
      hasFailedMigration && statusOutput.includes(recoveryMigration.toLowerCase());

    if (looksLikeForeignMigrationHistory(statusOutput)) {
      const databaseLabel = extractDatabaseLabel(process.env.DATABASE_URL);
      throw new Error(
        `Migration history mismatch detected on ${databaseLabel}. This backend appears connected to another project's database. Set DATABASE_URL to the backend-nowis database before startup.`
      );
    }

    if (hasTargetFailure) {
      logger.warn(
        { recoveryMigration, pass, maxPasses: MAX_RECOVERY_PASSES },
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

      // Certains historiques ont plusieurs lignes failed pour la meme migration.
      // On boucle et on re-tente tant que Prisma en detecte encore.
      continue;
    }

    if (hasFailedMigration) {
      throw new Error(
        `Prisma reported a failed migration other than ${recoveryMigration}. Automatic recovery stopped to avoid guessing.`
      );
    }

    logger.info({ pass, maxPasses: MAX_RECOVERY_PASSES }, 'Applying Prisma migrations (deploy) before server start...');
    const deployResult = await runCommand(npx, ['prisma', 'migrate', 'deploy'], true);
    if (deployResult.code === 0) {
      logger.info('Prisma migrations applied successfully.');
      return;
    }

    const deployOutput = `${deployResult.stdout}\n${deployResult.stderr}`.toLowerCase();
    const deployBlockedByTargetP3009 =
      deployOutput.includes('p3009') && deployOutput.includes(recoveryMigration.toLowerCase());

    if (deployBlockedByTargetP3009) {
      logger.warn(
        { recoveryMigration, pass, maxPasses: MAX_RECOVERY_PASSES },
        'Deploy blocked by P3009 on recovery migration; marking rolled back and retrying.'
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

      continue;
    }

    throw new Error('prisma migrate deploy exited with a non-zero code');
  }

  throw new Error(
    `Prisma migrate recovery exceeded ${MAX_RECOVERY_PASSES} attempts for ${recoveryMigration}.`
  );
}
