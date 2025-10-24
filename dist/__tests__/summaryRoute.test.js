"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../server/app");
const prisma_1 = require("../server/lib/prisma");
const env_1 = require("../server/env");
const amortization_1 = require("../server/services/amortization");
describe('Summary route enriched metrics', () => {
    const email = 'summary-metrics@nowis.local';
    let token;
    let userId;
    let corporateContext;
    beforeAll(async () => {
        jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const mortgageOnePayment = (0, amortization_1.calculateScheduledPayment)({
            principal: 100000,
            rateAnnual: 0.04,
            amortizationMonths: 300,
            paymentFrequency: 12
        });
        const mortgageTwoPayment = (0, amortization_1.calculateScheduledPayment)({
            principal: 50000,
            rateAnnual: 0.06,
            amortizationMonths: 240,
            paymentFrequency: 12
        });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Immeuble métriques',
                        currentValue: 300000,
                        units: {
                            create: [
                                { label: 'Unité A', rentExpected: 1500, squareFeet: 900 },
                                { label: 'Unité B', rentExpected: 1200, squareFeet: 800 }
                            ]
                        },
                        revenues: {
                            create: {
                                label: 'Loyers récurrents',
                                amount: 2700,
                                frequency: 'MENSUEL',
                                startDate: new Date('2025-01-01')
                            }
                        },
                        expenses: {
                            create: {
                                label: 'Charges communes',
                                amount: 500,
                                category: 'Maintenance',
                                frequency: 'MENSUEL',
                                startDate: new Date('2025-01-01')
                            }
                        },
                        mortgages: {
                            create: [
                                {
                                    lender: 'Banque 1',
                                    principal: 100000,
                                    rateAnnual: 0.04,
                                    termMonths: 60,
                                    amortizationMonths: 300,
                                    startDate: new Date('2025-01-01'),
                                    paymentFrequency: 12,
                                    paymentAmount: mortgageOnePayment
                                },
                                {
                                    lender: 'Banque 2',
                                    principal: 50000,
                                    rateAnnual: 0.06,
                                    termMonths: 60,
                                    amortizationMonths: 240,
                                    startDate: new Date('2025-01-01'),
                                    paymentFrequency: 12,
                                    paymentAmount: mortgageTwoPayment
                                }
                            ]
                        }
                    }
                }
            }
        });
        userId = user.id;
        token = jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
        const company = await prisma_1.prisma.company.create({
            data: {
                userId,
                name: 'Nouvelle Société',
                fiscalYearEnd: new Date('2024-12-31')
            }
        });
        const shareholder = await prisma_1.prisma.shareholder.create({
            data: {
                userId,
                displayName: 'Actionnaire principal',
                type: 'PERSON',
                contactEmail: 'principal@example.com'
            }
        });
        const companyShareholder = await prisma_1.prisma.companyShareholder.create({
            data: {
                companyId: company.id,
                shareholderId: shareholder.id,
                role: 'Administrateur',
                votingPercent: 65
            }
        });
        const shareClass = await prisma_1.prisma.shareClass.create({
            data: {
                companyId: company.id,
                code: 'ORD',
                description: 'Actions ordinaires'
            }
        });
        await prisma_1.prisma.shareTransaction.create({
            data: {
                companyId: company.id,
                shareClassId: shareClass.id,
                shareholderId: companyShareholder.shareholderId,
                type: 'ISSUANCE',
                transactionDate: new Date('2024-01-15'),
                quantity: 1000,
                pricePerShare: 10,
                considerationPaid: 10000,
                fairMarketValue: 12500,
                notes: 'Émission initiale d’actions'
            }
        });
        const statement = await prisma_1.prisma.corporateStatement.create({
            data: {
                companyId: company.id,
                statementType: 'INCOME_STATEMENT',
                periodStart: new Date('2023-01-01'),
                periodEnd: new Date('2023-12-31'),
                totalAssets: 250000,
                totalLiabilities: 150000,
                totalEquity: 100000,
                netIncome: 42000
            }
        });
        await prisma_1.prisma.corporateResolution.create({
            data: {
                companyId: company.id,
                type: 'DIVIDEND_DECLARATION',
                title: 'Distribution 2024',
                resolutionDate: new Date('2024-06-30'),
                body: 'Distribution d’un dividende exceptionnel.'
            }
        });
        corporateContext = {
            companyId: company.id,
            shareholderId: shareholder.id,
            shareClassId: shareClass.id,
            statementId: statement.id
        };
    });
    afterAll(async () => {
        jest.useRealTimers();
        await prisma_1.prisma.corporateResolution.deleteMany({ where: { companyId: corporateContext.companyId } });
        await prisma_1.prisma.corporateStatementLine.deleteMany({ where: { statementId: corporateContext.statementId } });
        await prisma_1.prisma.corporateStatement.deleteMany({ where: { companyId: corporateContext.companyId } });
        await prisma_1.prisma.shareTransaction.deleteMany({ where: { companyId: corporateContext.companyId } });
        await prisma_1.prisma.shareClass.deleteMany({ where: { companyId: corporateContext.companyId } });
        await prisma_1.prisma.companyShareholder.deleteMany({ where: { companyId: corporateContext.companyId } });
        await prisma_1.prisma.shareholder.deleteMany({ where: { id: corporateContext.shareholderId } });
        await prisma_1.prisma.company.deleteMany({ where: { id: corporateContext.companyId } });
        await prisma_1.prisma.invoice.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.expense.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.mortgage.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.propertyUnit.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it('expose les indicateurs enrichis pour les propriétés et totaux', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const { properties, totals, corporate } = response.body;
        expect(properties).toHaveLength(1);
        const property = properties[0];
        expect(property.unitsCount).toBe(2);
        expect(property.rentPotentialMonthly).toBeCloseTo(2700, 2);
        expect(property.squareFeetTotal).toBeCloseTo(1700, 2);
        expect(property.mortgageCount).toBe(2);
        expect(property.outstandingDebt).toBeCloseTo(150000, 2);
        expect(property.averageMortgageRate).toBeCloseTo(0.0466666, 5);
        expect(property.loanToValue).toBeCloseTo(0.5, 5);
        expect(totals.unitsCount).toBe(2);
        expect(totals.rentPotentialMonthly).toBeCloseTo(2700, 2);
        expect(totals.squareFeetTotal).toBeCloseTo(1700, 2);
        expect(totals.mortgageCount).toBe(2);
        expect(totals.outstandingDebt).toBeCloseTo(150000, 2);
        expect(totals.averageMortgageRate).toBeCloseTo(0.0466666, 5);
        expect(totals.loanToValue).toBeCloseTo(0.5, 5);
        expect(corporate).toMatchObject({
            companiesCount: 1,
            shareholdersCount: 1,
            shareClassesCount: 1,
            shareTransactionsCount: 1,
            statementsCount: 1,
            resolutionsCount: 1
        });
        expect(corporate.latestStatement).toMatchObject({
            companyName: 'Nouvelle Société',
            statementType: 'INCOME_STATEMENT',
            netIncome: 42000
        });
        expect(corporate.latestResolution).toMatchObject({
            companyName: 'Nouvelle Société',
            type: 'DIVIDEND_DECLARATION'
        });
    });
});
