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
describe('Invoices integration', () => {
    const email = 'invoice-summary@nowis.local';
    let token;
    let userId;
    let propertyId;
    beforeAll(async () => {
        await prisma_1.prisma.user.deleteMany({ where: { email } });
        const user = await prisma_1.prisma.user.create({
            data: {
                email,
                passwordHash: 'irrelevant',
                properties: {
                    create: {
                        name: 'Bloc Essai',
                        currentValue: 100000,
                        revenues: {
                            create: {
                                label: 'Loyer principal',
                                amount: 2000,
                                frequency: 'MENSUEL',
                                startDate: new Date('2024-01-01')
                            }
                        }
                    }
                }
            },
            include: {
                properties: true
            }
        });
        userId = user.id;
        propertyId = user.properties[0].id;
        token = jsonwebtoken_1.default.sign({ userId }, env_1.env.JWT_SECRET, { expiresIn: '1h' });
    });
    afterAll(async () => {
        await prisma_1.prisma.invoice.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.revenue.deleteMany({ where: { property: { userId } } });
        await prisma_1.prisma.property.deleteMany({ where: { userId } });
        await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
    });
    it("crée une facture avec date simplifiée et l'intègre au résumé", async () => {
        await (0, supertest_1.default)(app_1.app)
            .post('/api/invoices')
            .set('Authorization', `Bearer ${token}`)
            .send({
            propertyId,
            invoiceDate: '2024-08-15',
            supplier: 'Hydro Québec',
            amount: 100,
            category: 'Énergie',
            gst: 5,
            qst: 9.975
        })
            .expect(201);
        const summaryResponse = await (0, supertest_1.default)(app_1.app)
            .get('/api/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        const propertySummary = summaryResponse.body.properties[0];
        expect(propertySummary.operatingExpenses).toBeCloseTo(114.975, 3);
    });
});
