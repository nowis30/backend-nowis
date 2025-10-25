import bcrypt from 'bcrypt';

import { prisma } from '../server/lib/prisma';
import { calculateScheduledPayment } from '../server/services/amortization';

async function main() {
  // Utilisateurs supplémentaires pour la démo multi-utilisateurs
  const usersSeed = [
    { email: 'admin@nowis.local', password: 'Admin#2024!Nowis', role: 'ADMIN' },
    { email: 'collab@nowis.local', password: 'Collab#2024!Nowis', role: 'COLLAB' },
    { email: 'invite@nowis.local', password: 'Invite#2024!Nowis', role: 'INVITE' }
  ];

  for (const u of usersSeed) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash }
    });
    const role = await prisma.role.findUnique({ where: { name: u.role } });
    if (role) {
      const existingUserRole = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: role.id, companyId: null }
      });
      if (!existingUserRole) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: role.id, companyId: null }
        });
      }
    }
  }
  const email = 'demo@nowis.local';
  const passwordHash = await bcrypt.hash('Demo#2024!Nowis', 12);

  // Seed des rôles
  const roleAdmin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN' }
  });
  await prisma.role.upsert({
    where: { name: 'COLLAB' },
    update: {},
    create: { name: 'COLLAB' }
  });
  await prisma.role.upsert({
    where: { name: 'INVITE' },
    update: {},
    create: { name: 'INVITE' }
  });

  const scheduledPayment = calculateScheduledPayment({
    principal: 900000,
    rateAnnual: 0.045,
    amortizationMonths: 300,
    paymentFrequency: 12
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      properties: {
        create: [
          {
            name: 'Immeuble Centre-Ville',
            address: '123 Rue Principale, Montréal',
            purchasePrice: 1200000,
            currentValue: 1400000,
            revenues: {
              create: [{ label: 'Loyers', amount: 15000, frequency: 'MENSUEL', startDate: new Date() }]
            },
            expenses: {
              create: [
                { label: 'Entretien', amount: 2000, category: 'Maintenance', frequency: 'MENSUEL', startDate: new Date() }
              ]
            },
            mortgages: {
              create: [
                {
                  lender: 'Banque ABC',
                  principal: 900000,
                  rateAnnual: 0.045,
                  termMonths: 60,
                  amortizationMonths: 300,
                  startDate: new Date('2023-01-01'),
                  paymentFrequency: 12,
                  paymentAmount: scheduledPayment
                }
              ]
            }
          }
        ]
      }
    }
  });

  // Assignation du rôle ADMIN à l’utilisateur de démo
  const existingDemoUserRole = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: roleAdmin.id, companyId: null }
  });
  if (!existingDemoUserRole) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: roleAdmin.id, companyId: null }
    });
  }

  const companyName = 'Compagnie Familiale Tremblay';
  let company = await prisma.company.findFirst({
    where: {
      userId: user.id,
      name: companyName
    }
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        userId: user.id,
        name: companyName,
        neq: '1160000000',
        fiscalYearEnd: new Date('2024-12-31'),
        province: 'QC',
        notes: 'Structure corporative beta pour la phase 2.'
      }
    });
  }

  const property = await prisma.property.findFirst({
    where: {
      userId: user.id,
      name: 'Immeuble Centre-Ville'
    }
  });

  if (property && property.companyId !== company.id) {
    await prisma.property.update({
      where: { id: property.id },
      data: { companyId: company.id }
    });
  }

  const shareholderPrimaryName = 'Jean Tremblay';
  let primaryShareholder = await prisma.shareholder.findFirst({
    where: {
      userId: user.id,
      displayName: shareholderPrimaryName
    }
  });

  if (!primaryShareholder) {
    primaryShareholder = await prisma.shareholder.create({
      data: {
        userId: user.id,
        displayName: shareholderPrimaryName,
        type: 'PERSON',
        contactEmail: 'jean.tremblay@example.com'
      }
    });
  }

  const holdingShareholderName = 'Gestion Tremblay Inc.';
  let holdingShareholder = await prisma.shareholder.findFirst({
    where: {
      userId: user.id,
      displayName: holdingShareholderName
    }
  });

  if (!holdingShareholder) {
    holdingShareholder = await prisma.shareholder.create({
      data: {
        userId: user.id,
        displayName: holdingShareholderName,
        type: 'CORPORATION',
        contactEmail: 'info@gestion-tremblay.ca'
      }
    });
  }

  const ensureCompanyShareholder = async (shareholderId: number, role: string, votingPercent: number) => {
    const existing = await prisma.companyShareholder.findFirst({
      where: {
        companyId: company!.id,
        shareholderId
      }
    });

    if (!existing) {
      await prisma.companyShareholder.create({
        data: {
          companyId: company!.id,
          shareholderId,
          role,
          votingPercent
        }
      });
    }
  };

  await ensureCompanyShareholder(primaryShareholder.id, 'Administrateur', 60);
  await ensureCompanyShareholder(holdingShareholder.id, 'Holding familial', 40);

  const shareClassCommon = await prisma.shareClass.findFirst({
    where: { companyId: company.id, code: 'A' }
  });

  const classA = shareClassCommon
    ? shareClassCommon
    : await prisma.shareClass.create({
        data: {
          companyId: company.id,
          code: 'A',
          description: 'Actions ordinaires participantes',
          hasVotingRights: true,
          participatesInGrowth: true,
          dividendPolicy: 'Dividende discrétionnaire lorsque la trésorerie le permet.'
        }
      });

  const shareClassPref = await prisma.shareClass.findFirst({
    where: { companyId: company.id, code: 'PREF' }
  });

  const classPref = shareClassPref
    ? shareClassPref
    : await prisma.shareClass.create({
        data: {
          companyId: company.id,
          code: 'PREF',
          description: 'Actions privilégiées gelées',
          hasVotingRights: false,
          participatesInGrowth: false,
          dividendPolicy: 'Dividende annuel fixe 5%.'
        }
      });

  const issuanceExists = await prisma.shareTransaction.findFirst({
    where: {
      companyId: company.id,
      shareholderId: primaryShareholder.id,
      shareClassId: classA.id,
      transactionDate: new Date('2024-01-01')
    }
  });

  if (!issuanceExists) {
    await prisma.shareTransaction.create({
      data: {
        companyId: company.id,
        shareholderId: primaryShareholder.id,
        shareClassId: classA.id,
        type: 'ISSUANCE',
        transactionDate: new Date('2024-01-01'),
        quantity: 1000,
        pricePerShare: 1,
        considerationPaid: 1000,
        fairMarketValue: 1000
      }
    });
  }

  const freezeExists = await prisma.shareTransaction.findFirst({
    where: {
      companyId: company.id,
      shareholderId: holdingShareholder.id,
      shareClassId: classPref.id,
      transactionDate: new Date('2024-02-01')
    }
  });

  if (!freezeExists) {
    await prisma.shareTransaction.create({
      data: {
        companyId: company.id,
        shareholderId: holdingShareholder.id,
        shareClassId: classPref.id,
        type: 'ISSUANCE',
        transactionDate: new Date('2024-02-01'),
        quantity: 500,
        pricePerShare: 10,
        considerationPaid: 5000,
        fairMarketValue: 5000,
        notes: 'Gel successoral initial de la valeur de la compagnie.'
      }
    });
  }

  const balanceStatementDate = new Date('2024-12-31');
  let balanceStatement = await prisma.corporateStatement.findFirst({
    where: {
      companyId: company.id,
      statementType: 'BALANCE_SHEET',
      periodEnd: balanceStatementDate
    }
  });

  if (!balanceStatement) {
    balanceStatement = await prisma.corporateStatement.create({
      data: {
        companyId: company.id,
        statementType: 'BALANCE_SHEET',
        periodStart: new Date('2024-01-01'),
        periodEnd: balanceStatementDate,
        totalAssets: 1500000,
        totalLiabilities: 920000,
        totalEquity: 580000,
        metadata: 'Bilan synthèse pour la bêta.'
      }
    });

    await prisma.corporateStatementLine.createMany({
      data: [
        {
          statementId: balanceStatement.id,
          category: 'ASSET',
          label: 'Immeubles de placement',
          amount: 1400000,
          orderIndex: 1
        },
        {
          statementId: balanceStatement.id,
          category: 'ASSET',
          label: 'Encaisse',
          amount: 100000,
          orderIndex: 2
        },
        {
          statementId: balanceStatement.id,
          category: 'LIABILITY',
          label: 'Hypothèques à long terme',
          amount: 900000,
          orderIndex: 1
        },
        {
          statementId: balanceStatement.id,
          category: 'LIABILITY',
          label: 'Dette fournisseurs',
          amount: 20000,
          orderIndex: 2
        },
        {
          statementId: balanceStatement.id,
          category: 'EQUITY',
          label: 'Capital-actions',
          amount: 10000,
          orderIndex: 1
        },
        {
          statementId: balanceStatement.id,
          category: 'EQUITY',
          label: 'Bénéfices non répartis',
          amount: 570000,
          orderIndex: 2
        }
      ]
    });
  }

  const incomeStatementDate = new Date('2024-12-31');
  const incomeStatement = await prisma.corporateStatement.findFirst({
    where: {
      companyId: company.id,
      statementType: 'INCOME_STATEMENT',
      periodEnd: incomeStatementDate
    }
  });

  if (!incomeStatement) {
    const createdIncomeStatement = await prisma.corporateStatement.create({
      data: {
        companyId: company.id,
        statementType: 'INCOME_STATEMENT',
        periodStart: new Date('2024-01-01'),
        periodEnd: incomeStatementDate,
        totalRevenue: 320000,
        totalExpenses: 220000,
        netIncome: 100000,
        metadata: 'États des résultats consolidés.'
      }
    });

    await prisma.corporateStatementLine.createMany({
      data: [
        {
          statementId: createdIncomeStatement.id,
          category: 'REVENUE',
          label: 'Revenus de loyers',
          amount: 300000,
          orderIndex: 1
        },
        {
          statementId: createdIncomeStatement.id,
          category: 'REVENUE',
          label: 'Autres revenus',
          amount: 20000,
          orderIndex: 2
        },
        {
          statementId: createdIncomeStatement.id,
          category: 'EXPENSE',
          label: 'Charges d’exploitation',
          amount: 150000,
          orderIndex: 1
        },
        {
          statementId: createdIncomeStatement.id,
          category: 'EXPENSE',
          label: 'Intérêts sur la dette',
          amount: 70000,
          orderIndex: 2
        }
      ]
    });
  }

  const resolutionExists = await prisma.corporateResolution.findFirst({
    where: {
      companyId: company.id,
      type: 'DIVIDEND',
      resolutionDate: new Date('2025-01-15')
    }
  });

  if (!resolutionExists) {
    await prisma.corporateResolution.create({
      data: {
        companyId: company.id,
        type: 'DIVIDEND',
        title: 'Résolution de dividende annuel',
        resolutionDate: new Date('2025-01-15'),
        body:
          'Il est résolu que la Compagnie Familiale Tremblay verse un dividende de 25 000 $ aux détenteurs d’actions participatives, payable au 31 janvier 2025.'
      }
    });
  }

  const dividendDeclarationDate = new Date('2024-12-31');
  const existingDividend = await prisma.dividendDeclaration.findFirst({
    where: {
      companyId: company.id,
      shareholderId: primaryShareholder.id,
      declarationDate: dividendDeclarationDate
    }
  });

  if (!existingDividend) {
    await prisma.dividendDeclaration.create({
      data: {
        companyId: company.id,
        shareholderId: primaryShareholder.id,
        shareClassId: classA.id,
        declarationDate: dividendDeclarationDate,
        recordDate: new Date('2025-01-10'),
        paymentDate: new Date('2025-01-31'),
        amount: 25000,
        dividendType: 'ELIGIBLE',
        grossUpRate: 0.38,
        grossedAmount: 34500,
        federalCredit: 5175,
        provincialCredit: 4105,
        notes: 'Dividende annuel attribué à l’actionnaire principal.'
      }
    });
  }

  const rocDate = new Date('2024-11-15');
  const existingRoc = await prisma.returnOfCapitalRecord.findFirst({
    where: {
      companyId: company.id,
      shareholderId: holdingShareholder.id,
      transactionDate: rocDate
    }
  });

  if (!existingRoc) {
    await prisma.returnOfCapitalRecord.create({
      data: {
        companyId: company.id,
        shareholderId: holdingShareholder.id,
        shareClassId: classPref.id,
        transactionDate: rocDate,
        amount: 10000,
        previousAcb: 50000,
        newAcb: 40000,
        notes: 'Retour de capital pour ajuster le gel successoral.'
      }
    });
  }

  const shareholderLoan = await prisma.shareholderLoan.findFirst({
    where: {
      companyId: company.id,
      shareholderId: primaryShareholder.id
    }
  });

  if (!shareholderLoan) {
    const loan = await prisma.shareholderLoan.create({
      data: {
        companyId: company.id,
        shareholderId: primaryShareholder.id,
        issuedDate: new Date('2024-03-01'),
        principal: 50000,
        interestRate: 0.05,
        interestMethod: 'SIMPLE',
        dueDate: new Date('2025-03-01'),
        notes: 'Avance à l’actionnaire pour rénover l’immeuble locatif.'
      }
    });

    await prisma.shareholderLoanPayment.createMany({
      data: [
        {
          loanId: loan.id,
          paymentDate: new Date('2024-09-01'),
          principalPaid: 10000,
          interestPaid: 1200
        },
        {
          loanId: loan.id,
          paymentDate: new Date('2025-02-28'),
          principalPaid: 40000,
          interestPaid: 1000
        }
      ]
    });
  }

  await prisma.corporateTaxReturn.upsert({
    where: {
      companyId_fiscalYearEnd: {
        companyId: company.id,
        fiscalYearEnd: new Date('2024-12-31')
      }
    },
    create: {
      companyId: company.id,
      fiscalYearEnd: new Date('2024-12-31'),
      netIncome: 100000,
      taxableIncome: 95000,
      smallBusinessDeduction: 9000,
      federalTax: 11000,
      provincialTax: 9000,
      rdtohOpening: 8000,
      rdtohClosing: 5000,
      gripOpening: 12000,
      gripClosing: 16000,
      cdaOpening: 6000,
      cdaClosing: 8500,
      refunds: 3000,
      notes: 'Simulation fiscale corporative pour la phase 3.'
    },
    update: {
      netIncome: 100000,
      taxableIncome: 95000,
      smallBusinessDeduction: 9000,
      federalTax: 11000,
      provincialTax: 9000,
      rdtohOpening: 8000,
      rdtohClosing: 5000,
      gripOpening: 12000,
      gripClosing: 16000,
      cdaOpening: 6000,
      cdaClosing: 8500,
      refunds: 3000,
      notes: 'Simulation fiscale corporative pour la phase 3.'
    }
  });

  await prisma.personalTaxReturn.upsert({
    where: {
      shareholderId_taxYear: {
        shareholderId: primaryShareholder.id,
        taxYear: 2024
      }
    },
    create: {
      shareholderId: primaryShareholder.id,
      taxYear: 2024,
      employmentIncome: 90000,
      businessIncome: 15000,
      eligibleDividends: 25000,
      nonEligibleDividends: 0,
      capitalGains: 12000,
      deductions: 10000,
      otherCredits: 2000,
      taxableIncome: 132000,
      federalTax: 27000,
      provincialTax: 18500,
      totalCredits: 8000,
      balanceDue: 37500
    },
    update: {
      employmentIncome: 90000,
      businessIncome: 15000,
      eligibleDividends: 25000,
      nonEligibleDividends: 0,
      capitalGains: 12000,
      deductions: 10000,
      otherCredits: 2000,
      taxableIncome: 132000,
      federalTax: 27000,
      provincialTax: 18500,
      totalCredits: 8000,
      balanceDue: 37500
    }
  });

  console.log(`Utilisateur seedé : ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
