import { spawn } from 'child_process';
import jwt from 'jsonwebtoken';

import { prisma } from '../server/lib/prisma';
import { env } from '../server/env';

type ProbeResult = {
  url: string;
  status: number | null;
  ok: boolean;
  bodySnippet?: string;
  error?: string;
};

async function seedUser(): Promise<{ token: string }> {
  const email = 'manual-sanity@nowis.local';

  // Nettoyage complet de l'utilisateur si présent
  await prisma.invoiceItem.deleteMany({ where: { invoice: { property: { user: { email } } } } });
  await prisma.invoice.deleteMany({ where: { property: { user: { email } } } });
  await prisma.depreciationSetting.deleteMany({ where: { property: { user: { email } } } });
  await prisma.expense.deleteMany({ where: { property: { user: { email } } } });
  await prisma.revenue.deleteMany({ where: { property: { user: { email } } } });
  await prisma.mortgage.deleteMany({ where: { property: { user: { email } } } });
  await prisma.propertyUnit.deleteMany({ where: { property: { user: { email } } } });
  await prisma.property.deleteMany({ where: { user: { email } } });
  await prisma.personalExpense.deleteMany({ where: { user: { email } } });
  await prisma.personalLiability.deleteMany({ where: { user: { email } } });
  await prisma.personalAsset.deleteMany({ where: { user: { email } } });
  await prisma.financialGoalProgress.deleteMany({ where: { goal: { user: { email } } } });
  await prisma.financialGoal.deleteMany({ where: { user: { email } } });
  await prisma.investmentHolding.deleteMany({ where: { account: { user: { email } } } });
  await prisma.investmentAccount.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'irrelevant',
      properties: {
        create: {
          name: 'Bloc Sanity',
          currentValue: 650000,
          units: {
            create: [
              { label: '101', squareFeet: 900, rentExpected: 1500 },
              { label: '102', squareFeet: 950, rentExpected: 1600 }
            ]
          },
          revenues: {
            create: {
              label: 'Loyers',
              amount: 3100,
              frequency: 'MENSUEL',
              startDate: new Date('2024-01-01')
            }
          },
          expenses: {
            create: {
              label: 'Assurances',
              category: 'Assurance',
              amount: 500,
              frequency: 'MENSUEL',
              startDate: new Date('2024-01-01')
            }
          },
          mortgages: {
            create: {
              lender: 'Banque Test',
              principal: 300000,
              rateAnnual: 0.045,
              amortizationMonths: 300,
              termMonths: 60,
              startDate: new Date('2022-01-01'),
              paymentFrequency: 12,
              paymentAmount: 1800
            }
          }
        }
      }
    }
  });

  await prisma.personalAsset.create({
    data: {
      userId: user.id,
      label: 'Compte Épargne',
      category: 'CASH',
      valuation: 25000,
      valuationDate: new Date('2024-06-01'),
      ownerType: 'SELF'
    }
  });

  await prisma.personalLiability.create({
    data: {
      userId: user.id,
      label: 'Prêt Auto',
      category: 'LOAN',
      balance: 12000,
      interestRate: 0.055,
      maturityDate: new Date('2027-03-01')
    }
  });

  await prisma.personalExpense.createMany({
    data: [
      {
        userId: user.id,
        label: 'Hypothèque résidence',
        category: 'HOUSING',
        amount: 1800,
        frequency: 'MONTHLY',
        essential: true
      },
      {
        userId: user.id,
        label: 'Épicerie',
        category: 'FOOD',
        amount: 250,
        frequency: 'WEEKLY',
        essential: true
      }
    ]
  });

  const investmentAccount = await prisma.investmentAccount.create({
    data: {
      userId: user.id,
      label: 'Portefeuille RRSP',
      accountType: 'RRSP',
      currency: 'CAD'
    }
  });

  await prisma.investmentHolding.create({
    data: {
      accountId: investmentAccount.id,
      symbol: 'XEQT',
      quantity: 200,
      bookValue: 80000,
      marketValue: 92000,
      currency: 'CAD'
    }
  });

  const financialGoal = await prisma.financialGoal.create({
    data: {
      userId: user.id,
      name: 'Retraite 60 ans',
      goalType: 'RETIREMENT',
      targetAmount: 1000000,
      priority: 1,
      status: 'ACTIVE'
    }
  });

  await prisma.financialGoalProgress.createMany({
    data: [
      {
        goalId: financialGoal.id,
        progressDate: new Date('2024-05-01'),
        amount: 200000
      },
      {
        goalId: financialGoal.id,
        progressDate: new Date('2025-05-01'),
        amount: 50000
      }
    ]
  });

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: '2h' });
  return { token };
}

function startServer(): Promise<{ process: ReturnType<typeof spawn> }>
{ return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/index.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ADVISOR_ENGINE: process.env.ADVISOR_ENGINE ?? 'heuristic'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let resolved = false;

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes('API Nowis')) {
        resolved = true;
        child.stdout?.off('data', onData);
        resolve({ process: child });
      }
    };

    const onError = (err: Error) => {
      if (!resolved) {
        reject(err);
      } else {
        console.error('[server]', err);
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', onError);
    child.once('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Serveur arrêté avant disponibilité (code ${code}).`));
      }
    });
  });
}

async function probe(url: string, token?: string): Promise<ProbeResult> {
  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    const text = await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok,
      bodySnippet: text.slice(0, 200)
    };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function run() {
  const { token } = await seedUser();
  const { process: server } = await startServer();

  const baseUrl = 'http://127.0.0.1:4000';
  const results: ProbeResult[] = [];

  results.push(await probe(`${baseUrl}/health`));
  results.push(await probe(`${baseUrl}/api/health`));
  results.push(await probe(`${baseUrl}/api/advisors/health`));
  results.push(await probe(`${baseUrl}/api/summary`, token));
  results.push(await probe(`${baseUrl}/api/profile/summary`, token));
  results.push(await probe(`${baseUrl}/api/advisors/questions`, token));

  console.log('\nRésultats des sondes:');
  for (const result of results) {
    console.log(`${result.url} -> ${result.status ?? 'ERR'} (${result.ok ? 'OK' : 'FAIL'})`);
    if (result.error) {
      console.log(`  erreur: ${result.error}`);
    } else if (result.bodySnippet) {
      console.log(`  extrait: ${result.bodySnippet}`);
    }
  }

  server.kill('SIGTERM');
}

run()
  .catch((error) => {
    console.error('Sanity check failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
