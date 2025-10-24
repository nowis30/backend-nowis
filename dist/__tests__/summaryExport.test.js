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
describe('Summary exports', () => {
    const email = 'export-test@nowis.local';
    let token;
    let userId;
    beforeAll(async () => {
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const scheduledPayment = (0, amortization_1.calculateScheduledPayment)({
            principal: 180000,
            rateAnnual: 0.04,
            amortizationMonths: 300,
            paymentFrequency: 12
        });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Test Immeuble',
                        currentValue: 250000,
                        revenues: { create: { label: 'Loyers', amount: 2000, frequency: 'MENSUEL', startDate: new Date() } },
                        expenses: { create: { label: 'Charges', amount: 500, category: 'Maintenance', frequency: 'MENSUEL', startDate: new Date() } },
                        mortgages: {
                            create: {
                                lender: 'Banque Test',
                                principal: 180000,
                                rateAnnual: 0.04,
                                termMonths: 60,
                                amortizationMonths: 300,
                                startDate: new Date('2024-01-01'),
                                paymentFrequency: 12,
                                paymentAmount: scheduledPayment
                            }
                        }
                    }
                },
                companies: {
                    create: {
                        name: 'Société Export',
                        province: 'QC',
                        fiscalYearEnd: new Date('2024-12-31'),
                        statements: {
                            create: {
                                statementType: 'ANNUAL',
                                periodStart: new Date('2024-01-01'),
                                periodEnd: new Date('2024-12-31'),
                                isAudited: true,
                                totalAssets: 125000,
                                totalLiabilities: 35000,
                                totalEquity: 90000,
                                totalRevenue: 200000,
                                totalExpenses: 150000,
                                netIncome: 50000,
                                lines: {
                                    create: [
                                        {
                                            category: 'ACTIF',
                                            label: 'Trésorerie',
                                            amount: 45000,
                                            orderIndex: 0
                                        },
                                        {
                                            category: 'PASSIF',
                                            label: 'Dette bancaire',
                                            amount: 35000,
                                            orderIndex: 1
                                        }
                                    ]
                                }
                            }
                        },
                        resolutions: {
                            create: {
                                type: 'ANNUAL_MEETING',
                                title: 'Approbation des états financiers',
                                resolutionDate: new Date('2025-03-15'),
                                body: 'Les administrateurs approuvent les états financiers annuels.'
                            }
                        }
                    }
                }
            }
        });
        userId = user.id;
        token = jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
    });
    afterAll(async () => {
        await prisma_1.prisma.corporateResolution.deleteMany({ where: { company: { userId } } });
        await prisma_1.prisma.corporateStatementLine.deleteMany({ where: { statement: { company: { userId } } } });
        await prisma_1.prisma.corporateStatement.deleteMany({ where: { company: { userId } } });
        await prisma_1.prisma.company.deleteMany({ where: { userId } });
        await prisma_1.prisma.invoice.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.expense.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.mortgage.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it('retourne un fichier CSV téléchargeable', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary/export/csv')
            .set('Authorization', `Bearer ${token}`)
            .expect('Content-Type', /text\/csv/)
            .expect(200);
        expect(response.header['content-disposition']).toContain('attachment');
        const contents = response.text.replace(/^\uFEFF/, '');
        const lines = contents.split('\r\n');
        expect(lines.length).toBeGreaterThan(10);
        const propertyHeaderCells = lines[0]
            .split(',')
            .map((cell) => cell.replace(/^"|"$/g, ''));
        expect(propertyHeaderCells).toEqual([
            'Immeuble',
            'Unités',
            'Loyer potentiel',
            'Dette en cours',
            'Ratio LTV (%)',
            'Revenus',
            'Dépenses',
            'Service de la dette',
            'Intérêts',
            'Capital',
            'Cashflow net',
            'CCA',
            'Équité'
        ]);
        const firstBlankIndex = lines.findIndex((line, index) => index > 0 && line === '');
        expect(firstBlankIndex).toBeGreaterThan(1);
        const propertyRows = lines.slice(1, firstBlankIndex === -1 ? lines.length : firstBlankIndex);
        expect(propertyRows.length).toBeGreaterThanOrEqual(1);
        const firstPropertyCells = propertyRows[0]
            .split(',')
            .map((cell) => cell.replace(/^"|"$/g, ''));
        expect(firstPropertyCells[0]).toBe('Test Immeuble');
        expect(firstPropertyCells).toHaveLength(propertyHeaderCells.length);
        const totalRowCells = propertyRows[propertyRows.length - 1]
            .split(',')
            .map((cell) => cell.replace(/^"|"$/g, ''));
        expect(totalRowCells[0]).toBe('TOTAL');
        expect(totalRowCells).toHaveLength(propertyHeaderCells.length);
        const corporateSectionIndex = lines.findIndex((line) => line.replace(/^"|"$/g, '') === 'Synthèse corporate');
        expect(corporateSectionIndex).toBeGreaterThan(firstBlankIndex);
        const metricsHeaderIndex = corporateSectionIndex + 1;
        const metricsHeader = lines[metricsHeaderIndex]
            .split(',')
            .map((cell) => cell.replace(/^"|"$/g, ''));
        expect(metricsHeader).toEqual(['Indicateur', 'Valeur']);
        const hasStatementSection = lines.some((line) => line.replace(/^"|"$/g, '') === 'États financiers (synthèse)');
        expect(hasStatementSection).toBe(true);
        const hasResolutionSection = lines.some((line) => line.replace(/^"|"$/g, '') === 'Résolutions corporatives');
        expect(hasResolutionSection).toBe(true);
    });
    it('retourne un fichier PDF téléchargeable', async () => {
        const response = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary/export/pdf')
            .set('Authorization', `Bearer ${token}`)
            .buffer(true)
            .parse((res, callback) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
            .expect('Content-Type', /application\/pdf/)
            .expect(200);
        expect(response.header['content-disposition']).toContain('attachment');
        expect(response.body.slice(0, 4).toString()).toBe('%PDF');
    });
});
