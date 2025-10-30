"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../server/lib/prisma");
const amortization_1 = require("../server/services/amortization");
async function main() {
    // Utilisateurs supplémentaires pour la démo multi-utilisateurs
    const usersSeed = [
        { email: 'admin@nowis.local', password: 'Admin#2024!Nowis', role: 'ADMIN' },
        { email: 'collab@nowis.local', password: 'Collab#2024!Nowis', role: 'COLLAB' },
        { email: 'invite@nowis.local', password: 'Invite#2024!Nowis', role: 'INVITE' }
    ];
    for (const u of usersSeed) {
        const passwordHash = await bcrypt_1.default.hash(u.password, 12);
        const user = await prisma_1.prisma.user.upsert({
            where: { email: u.email },
            update: {},
            create: { email: u.email, passwordHash }
        });
        const role = await prisma_1.prisma.role.findUnique({ where: { name: u.role } });
        if (role) {
            const existingUserRole = await prisma_1.prisma.userRole.findFirst({
                where: { userId: user.id, roleId: role.id, companyId: null }
            });
            if (!existingUserRole) {
                await prisma_1.prisma.userRole.create({
                    data: { userId: user.id, roleId: role.id, companyId: null }
                });
            }
        }
    }
    const email = 'demo@nowis.local';
    const passwordHash = await bcrypt_1.default.hash('Demo#2024!Nowis', 12);
    // Seed des rôles
    const roleAdmin = await prisma_1.prisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN' }
    });
    await prisma_1.prisma.role.upsert({
        where: { name: 'COLLAB' },
        update: {},
        create: { name: 'COLLAB' }
    });
    await prisma_1.prisma.role.upsert({
        where: { name: 'INVITE' },
        update: {},
        create: { name: 'INVITE' }
    });
    const scheduledPayment = (0, amortization_1.calculateScheduledPayment)({
        principal: 900000,
        rateAnnual: 0.045,
        amortizationMonths: 300,
        paymentFrequency: 12
    });
    const user = await prisma_1.prisma.user.upsert({
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
    const existingDemoUserRole = await prisma_1.prisma.userRole.findFirst({
        where: { userId: user.id, roleId: roleAdmin.id, companyId: null }
    });
    if (!existingDemoUserRole) {
        await prisma_1.prisma.userRole.create({
            data: { userId: user.id, roleId: roleAdmin.id, companyId: null }
        });
    }
    const companyName = 'Compagnie Familiale Tremblay';
    let company = await prisma_1.prisma.company.findFirst({
        where: {
            userId: user.id,
            name: companyName
        }
    });
    if (!company) {
        company = await prisma_1.prisma.company.create({
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
    const property = await prisma_1.prisma.property.findFirst({
        where: {
            userId: user.id,
            name: 'Immeuble Centre-Ville'
        }
    });
    if (property && property.companyId !== company.id) {
        await prisma_1.prisma.property.update({
            where: { id: property.id },
            data: { companyId: company.id }
        });
    }
    const shareholderPrimaryName = 'Jean Tremblay';
    let primaryShareholder = await prisma_1.prisma.shareholder.findFirst({
        where: {
            userId: user.id,
            displayName: shareholderPrimaryName
        }
    });
    if (!primaryShareholder) {
        primaryShareholder = await prisma_1.prisma.shareholder.create({
            data: {
                userId: user.id,
                displayName: shareholderPrimaryName,
                type: 'PERSON',
                contactEmail: 'jean.tremblay@example.com'
            }
        });
    }
    // --- MDC: Person, Household, LegalEntity seed ---
    // Person for the primary shareholder
    let primaryPerson = await prisma_1.prisma.person.findFirst({
        where: { userId: user.id, displayName: shareholderPrimaryName }
    });
    if (!primaryPerson) {
        primaryPerson = await prisma_1.prisma.person.create({
            data: {
                userId: user.id,
                displayName: shareholderPrimaryName,
                birthDate: new Date('1982-06-15'),
                gender: 'M',
                address: '123 Rue Principale, Montréal'
            }
        });
    }
    // Link Shareholder -> Person
    if (!primaryShareholder.personId) {
        await prisma_1.prisma.shareholder.update({
            where: { id: primaryShareholder.id },
            data: { personId: primaryPerson.id }
        });
    }
    // Spouse/partner person for demo
    const spouseName = 'Marie Tremblay';
    let spousePerson = await prisma_1.prisma.person.findFirst({ where: { userId: user.id, displayName: spouseName } });
    if (!spousePerson) {
        spousePerson = await prisma_1.prisma.person.create({
            data: {
                userId: user.id,
                displayName: spouseName,
                birthDate: new Date('1984-09-02'),
                gender: 'F',
                address: '123 Rue Principale, Montréal'
            }
        });
    }
    // Household for current tax year with members
    const currentYear = new Date().getFullYear();
    let household = await prisma_1.prisma.household.findFirst({ where: { userId: user.id, year: currentYear } });
    if (!household) {
        household = await prisma_1.prisma.household.create({
            data: {
                userId: user.id,
                year: currentYear,
                members: {
                    create: [
                        { personId: primaryPerson.id, relationship: 'PRIMARY', isPrimary: true },
                        { personId: spousePerson.id, relationship: 'SPOUSE', isPrimary: false }
                    ]
                }
            }
        });
    }
    // LegalEntity mapped to the demo company (generic link)
    const existingEntity = await prisma_1.prisma.legalEntity.findFirst({
        where: { userId: user.id, companyId: company.id }
    });
    if (!existingEntity) {
        await prisma_1.prisma.legalEntity.create({
            data: {
                userId: user.id,
                name: company.name,
                type: 'inc',
                jurisdiction: 'QC',
                companyId: company.id
            }
        });
    }
    const holdingShareholderName = 'Gestion Tremblay Inc.';
    let holdingShareholder = await prisma_1.prisma.shareholder.findFirst({
        where: {
            userId: user.id,
            displayName: holdingShareholderName
        }
    });
    if (!holdingShareholder) {
        holdingShareholder = await prisma_1.prisma.shareholder.create({
            data: {
                userId: user.id,
                displayName: holdingShareholderName,
                type: 'CORPORATION',
                contactEmail: 'info@gestion-tremblay.ca'
            }
        });
    }
    const ensureCompanyShareholder = async (shareholderId, role, votingPercent) => {
        const existing = await prisma_1.prisma.companyShareholder.findFirst({
            where: {
                companyId: company.id,
                shareholderId
            }
        });
        if (!existing) {
            await prisma_1.prisma.companyShareholder.create({
                data: {
                    companyId: company.id,
                    shareholderId,
                    role,
                    votingPercent
                }
            });
        }
    };
    await ensureCompanyShareholder(primaryShareholder.id, 'Administrateur', 60);
    await ensureCompanyShareholder(holdingShareholder.id, 'Holding familial', 40);
    const shareClassCommon = await prisma_1.prisma.shareClass.findFirst({
        where: { companyId: company.id, code: 'A' }
    });
    const classA = shareClassCommon
        ? shareClassCommon
        : await prisma_1.prisma.shareClass.create({
            data: {
                companyId: company.id,
                code: 'A',
                description: 'Actions ordinaires participantes',
                hasVotingRights: true,
                participatesInGrowth: true,
                dividendPolicy: 'Dividende discrétionnaire lorsque la trésorerie le permet.'
            }
        });
    const shareClassPref = await prisma_1.prisma.shareClass.findFirst({
        where: { companyId: company.id, code: 'PREF' }
    });
    const classPref = shareClassPref
        ? shareClassPref
        : await prisma_1.prisma.shareClass.create({
            data: {
                companyId: company.id,
                code: 'PREF',
                description: 'Actions privilégiées gelées',
                hasVotingRights: false,
                participatesInGrowth: false,
                dividendPolicy: 'Dividende annuel fixe 5%.'
            }
        });
    const issuanceExists = await prisma_1.prisma.shareTransaction.findFirst({
        where: {
            companyId: company.id,
            shareholderId: primaryShareholder.id,
            shareClassId: classA.id,
            transactionDate: new Date('2024-01-01')
        }
    });
    if (!issuanceExists) {
        await prisma_1.prisma.shareTransaction.create({
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
    const freezeExists = await prisma_1.prisma.shareTransaction.findFirst({
        where: {
            companyId: company.id,
            shareholderId: holdingShareholder.id,
            shareClassId: classPref.id,
            transactionDate: new Date('2024-02-01')
        }
    });
    if (!freezeExists) {
        await prisma_1.prisma.shareTransaction.create({
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
    let balanceStatement = await prisma_1.prisma.corporateStatement.findFirst({
        where: {
            companyId: company.id,
            statementType: 'BALANCE_SHEET',
            periodEnd: balanceStatementDate
        }
    });
    if (!balanceStatement) {
        balanceStatement = await prisma_1.prisma.corporateStatement.create({
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
        await prisma_1.prisma.corporateStatementLine.createMany({
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
    const incomeStatement = await prisma_1.prisma.corporateStatement.findFirst({
        where: {
            companyId: company.id,
            statementType: 'INCOME_STATEMENT',
            periodEnd: incomeStatementDate
        }
    });
    if (!incomeStatement) {
        const createdIncomeStatement = await prisma_1.prisma.corporateStatement.create({
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
        await prisma_1.prisma.corporateStatementLine.createMany({
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
    const resolutionExists = await prisma_1.prisma.corporateResolution.findFirst({
        where: {
            companyId: company.id,
            type: 'DIVIDEND',
            resolutionDate: new Date('2025-01-15')
        }
    });
    if (!resolutionExists) {
        await prisma_1.prisma.corporateResolution.create({
            data: {
                companyId: company.id,
                type: 'DIVIDEND',
                title: 'Résolution de dividende annuel',
                resolutionDate: new Date('2025-01-15'),
                body: 'Il est résolu que la Compagnie Familiale Tremblay verse un dividende de 25 000 $ aux détenteurs d’actions participatives, payable au 31 janvier 2025.'
            }
        });
    }
    const dividendDeclarationDate = new Date('2024-12-31');
    const existingDividend = await prisma_1.prisma.dividendDeclaration.findFirst({
        where: {
            companyId: company.id,
            shareholderId: primaryShareholder.id,
            declarationDate: dividendDeclarationDate
        }
    });
    if (!existingDividend) {
        await prisma_1.prisma.dividendDeclaration.create({
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
    const existingRoc = await prisma_1.prisma.returnOfCapitalRecord.findFirst({
        where: {
            companyId: company.id,
            shareholderId: holdingShareholder.id,
            transactionDate: rocDate
        }
    });
    if (!existingRoc) {
        await prisma_1.prisma.returnOfCapitalRecord.create({
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
    const shareholderLoan = await prisma_1.prisma.shareholderLoan.findFirst({
        where: {
            companyId: company.id,
            shareholderId: primaryShareholder.id
        }
    });
    if (!shareholderLoan) {
        const loan = await prisma_1.prisma.shareholderLoan.create({
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
        await prisma_1.prisma.shareholderLoanPayment.createMany({
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
    await prisma_1.prisma.corporateTaxReturn.upsert({
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
    await prisma_1.prisma.personalTaxReturn.upsert({
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
    // --- Seeds référentiels: plan de comptes (global) ---
    const baseAccounts = [
        { code: '1000', name: 'Actif', type: 'ASSET' },
        { code: '1100', name: 'Trésorerie', type: 'ASSET', parentCode: '1000' },
        { code: '1200', name: 'Comptes à recevoir', type: 'ASSET', parentCode: '1000' },
        { code: '2000', name: 'Passif', type: 'LIABILITY' },
        { code: '2100', name: 'Emprunts', type: 'LIABILITY', parentCode: '2000' },
        { code: '2200', name: 'Comptes à payer', type: 'LIABILITY', parentCode: '2000' },
        { code: '3000', name: 'Capitaux propres', type: 'EQUITY' },
        { code: '3100', name: 'Capital-actions', type: 'EQUITY', parentCode: '3000' },
        { code: '3200', name: 'Bénéfices non répartis', type: 'EQUITY', parentCode: '3000' },
        { code: '4000', name: 'Produits', type: 'REVENUE' },
        { code: '4100', name: 'Revenus de loyers', type: 'REVENUE', parentCode: '4000' },
        { code: '4110', name: "Revenus d'emploi", type: 'REVENUE', parentCode: '4000' },
        { code: '4115', name: "Revenus d'entreprise", type: 'REVENUE', parentCode: '4000' },
        { code: '4120', name: 'Dividendes admissibles', type: 'REVENUE', parentCode: '4000' },
        { code: '4121', name: 'Dividendes non admissibles', type: 'REVENUE', parentCode: '4000' },
        { code: '4130', name: 'Gains en capital imposables', type: 'REVENUE', parentCode: '4000' },
        { code: '4140', name: 'Pensions privées', type: 'REVENUE', parentCode: '4000' },
        { code: '4150', name: 'Pension de vieillesse (OAS/RPC/RRQ)', type: 'REVENUE', parentCode: '4000' },
        { code: '4160', name: 'Retraits REER/FERR', type: 'REVENUE', parentCode: '4000' },
        { code: '4200', name: 'Autres revenus', type: 'REVENUE', parentCode: '4000' },
        { code: '5000', name: 'Charges', type: 'EXPENSE' },
        { code: '5100', name: 'Entretien', type: 'EXPENSE', parentCode: '5000' },
        { code: '5200', name: 'Assurances', type: 'EXPENSE', parentCode: '5000' },
        { code: '5300', name: 'Intérêts', type: 'EXPENSE', parentCode: '5000' }
    ];
    for (const acc of baseAccounts) {
        const exists = await prisma_1.prisma.account.findFirst({ where: { userId: null, code: acc.code } });
        if (!exists) {
            await prisma_1.prisma.account.create({
                data: {
                    userId: null,
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    parentCode: acc.parentCode ?? null,
                    isActive: true
                }
            });
        }
    }
    // --- Seeds référentiels: classes CCA (global) ---
    const ccaClasses = [
        { classCode: '1', description: 'Bâtiments (50% déduction additionnelle initiale exclue, taux de base)', rate: 0.04 },
        { classCode: '3', description: 'Bâtiments (acquis avant 1988)', rate: 0.05 },
        { classCode: '8', description: 'Mobilier et équipements divers', rate: 0.20 },
        { classCode: '10', description: 'Véhicules automobiles et équipements', rate: 0.30 },
        { classCode: '13', description: 'Améliorations locatives (amortissement linéaire)', rate: 0.00 }
    ];
    for (const c of ccaClasses) {
        const exists = await prisma_1.prisma.cCAClass.findFirst({ where: { userId: null, classCode: c.classCode } });
        if (!exists) {
            await prisma_1.prisma.cCAClass.create({
                data: {
                    userId: null,
                    classCode: c.classCode,
                    description: c.description,
                    rate: c.rate
                }
            });
        }
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
