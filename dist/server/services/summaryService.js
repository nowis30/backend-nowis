"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSummary = buildSummary;
exports.buildSummaryForExport = buildSummaryForExport;
const prisma_1 = require("../lib/prisma");
const amortization_1 = require("./amortization");
function safeNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value === 'object' && value !== null) {
        const candidate = value;
        if (typeof candidate.toNumber === 'function') {
            const parsed = candidate.toNumber();
            return Number.isFinite(parsed) ? parsed : 0;
        }
        if (typeof candidate.valueOf === 'function') {
            const rawValue = candidate.valueOf();
            const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
            return Number.isFinite(parsed) ? parsed : 0;
        }
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function sumDecimals(values) {
    return values.reduce((acc, value) => acc + Number(value ?? 0), 0);
}
function calculateCca(depreciation, netIncomeBeforeCca) {
    if (!depreciation) {
        return 0;
    }
    const rate = Number(depreciation.ccaRate ?? 0);
    if (rate <= 0) {
        return 0;
    }
    const opening = Number(depreciation.openingUcc ?? 0);
    const additions = Number(depreciation.additions ?? 0);
    const dispositions = Number(depreciation.dispositions ?? 0);
    const uccBase = Math.max(0, opening + additions * 0.5 - dispositions);
    const ccaMax = uccBase * rate;
    if (ccaMax <= 0) {
        return 0;
    }
    if (netIncomeBeforeCca <= 0) {
        return 0;
    }
    return Math.min(ccaMax, netIncomeBeforeCca);
}
async function buildSummary(userId) {
    const [propertyRecords, companiesCount, shareholdersCount, shareClassesCount, shareTransactionAgg, statementAgg, resolutionsCount, latestStatement, latestResolution, latestPersonalReturn, personalReturnsCount] = await Promise.all([
        prisma_1.prisma.property.findMany({
            where: { userId },
            include: {
                units: true,
                mortgages: true,
                revenues: true,
                expenses: true,
                invoices: true,
                depreciationInfo: true
            }
        }),
        prisma_1.prisma.company.count({ where: { userId } }),
        prisma_1.prisma.companyShareholder.count({ where: { company: { userId } } }),
        prisma_1.prisma.shareClass.count({ where: { company: { userId } } }),
        prisma_1.prisma.shareTransaction.aggregate({
            where: { company: { userId } },
            _count: true,
            _sum: {
                fairMarketValue: true,
                considerationPaid: true
            }
        }),
        prisma_1.prisma.corporateStatement.aggregate({
            where: { company: { userId } },
            _count: true,
            _sum: {
                totalAssets: true,
                totalEquity: true,
                netIncome: true
            }
        }),
        prisma_1.prisma.corporateResolution.count({ where: { company: { userId } } }),
        prisma_1.prisma.corporateStatement.findFirst({
            where: { company: { userId } },
            orderBy: { periodEnd: 'desc' },
            select: {
                id: true,
                companyId: true,
                statementType: true,
                periodEnd: true,
                netIncome: true,
                totalEquity: true,
                company: { select: { name: true } }
            }
        }),
        prisma_1.prisma.corporateResolution.findFirst({
            where: { company: { userId } },
            orderBy: { resolutionDate: 'desc' },
            select: {
                id: true,
                companyId: true,
                type: true,
                title: true,
                resolutionDate: true,
                company: { select: { name: true } }
            }
        }),
        // Données personnelles (impôt): dernier rapport disponible pour l'utilisateur
        prisma_1.prisma.personalTaxReturn.findFirst({
            where: { shareholder: { userId } },
            orderBy: { taxYear: 'desc' },
            include: { slips: { select: { slipType: true } } }
        }),
        prisma_1.prisma.personalTaxReturn.count({ where: { shareholder: { userId } } })
    ]);
    const properties = propertyRecords;
    let weightedRateNumerator = 0;
    let weightedRateDenominator = 0;
    let totalCurrentValue = 0;
    const propertySummaries = properties.map((property) => {
        const income = sumDecimals(property.revenues.map((revenue) => revenue.amount));
        const recurringExpenses = sumDecimals(property.expenses.map((expense) => expense.amount));
        const invoiceExpenses = property.invoices.reduce((acc, invoice) => {
            const base = Number(invoice.amount ?? 0);
            const gst = Number(invoice.gst ?? 0);
            const qst = Number(invoice.qst ?? 0);
            return acc + base + gst + qst;
        }, 0);
        const expenses = recurringExpenses + invoiceExpenses;
        const mortgageStats = property.mortgages.map((mortgage) => (0, amortization_1.calculateMortgagePeriod)(mortgage));
        const debtService = sumDecimals(mortgageStats.map((stats) => stats.payment));
        const interest = sumDecimals(mortgageStats.map((stats) => stats.interest));
        const principal = sumDecimals(mortgageStats.map((stats) => stats.principal));
        const netCashflow = income - expenses - debtService;
        const netIncomeBeforeCca = income - expenses - interest;
        const cca = calculateCca(property.depreciationInfo, netIncomeBeforeCca);
        const outstandingMortgage = sumDecimals(mortgageStats.map((stats) => stats.outstandingBalance));
        const equity = Number(property.currentValue ?? 0) - outstandingMortgage;
        const unitsCount = property.units.length;
        const rentPotentialMonthly = sumDecimals(property.units.map((unit) => unit.rentExpected ?? 0));
        const squareFeetTotal = property.units.reduce((acc, unit) => acc + Number(unit.squareFeet ?? 0), 0);
        const mortgageCount = property.mortgages.length;
        const weightedRateForProperty = property.mortgages.reduce((acc, mortgage, index) => {
            const rate = Number(mortgage.rateAnnual ?? 0);
            const outstanding = Number(mortgageStats[index]?.outstandingBalance ?? 0);
            return acc + rate * outstanding;
        }, 0);
        weightedRateNumerator += weightedRateForProperty;
        weightedRateDenominator += outstandingMortgage;
        totalCurrentValue += Number(property.currentValue ?? 0);
        const averageMortgageRate = outstandingMortgage > 0 ? weightedRateForProperty / outstandingMortgage : null;
        const loanToValue = outstandingMortgage > 0 && Number(property.currentValue ?? 0) > 0
            ? outstandingMortgage / Number(property.currentValue ?? 0)
            : null;
        return {
            propertyId: property.id,
            propertyName: property.name,
            grossIncome: income,
            operatingExpenses: expenses,
            debtService,
            interestPortion: interest,
            principalPortion: principal,
            netCashflow,
            cca,
            equity,
            unitsCount,
            rentPotentialMonthly,
            squareFeetTotal,
            mortgageCount,
            outstandingDebt: outstandingMortgage,
            averageMortgageRate,
            loanToValue
        };
    });
    const totals = propertySummaries.reduce((acc, summary) => ({
        grossIncome: acc.grossIncome + summary.grossIncome,
        operatingExpenses: acc.operatingExpenses + summary.operatingExpenses,
        debtService: acc.debtService + summary.debtService,
        interestPortion: acc.interestPortion + summary.interestPortion,
        principalPortion: acc.principalPortion + summary.principalPortion,
        netCashflow: acc.netCashflow + summary.netCashflow,
        cca: acc.cca + summary.cca,
        equity: acc.equity + summary.equity,
        unitsCount: acc.unitsCount + summary.unitsCount,
        rentPotentialMonthly: acc.rentPotentialMonthly + summary.rentPotentialMonthly,
        squareFeetTotal: acc.squareFeetTotal + summary.squareFeetTotal,
        mortgageCount: acc.mortgageCount + summary.mortgageCount,
        outstandingDebt: acc.outstandingDebt + summary.outstandingDebt,
        averageMortgageRate: null,
        loanToValue: null
    }), {
        grossIncome: 0,
        operatingExpenses: 0,
        debtService: 0,
        interestPortion: 0,
        principalPortion: 0,
        netCashflow: 0,
        cca: 0,
        equity: 0,
        unitsCount: 0,
        rentPotentialMonthly: 0,
        squareFeetTotal: 0,
        mortgageCount: 0,
        outstandingDebt: 0,
        averageMortgageRate: null,
        loanToValue: null
    });
    totals.averageMortgageRate = weightedRateDenominator > 0 ? weightedRateNumerator / weightedRateDenominator : null;
    totals.loanToValue = totals.outstandingDebt > 0 && totalCurrentValue > 0 ? totals.outstandingDebt / totalCurrentValue : null;
    const corporate = {
        companiesCount,
        shareholdersCount,
        shareClassesCount,
        shareTransactionsCount: shareTransactionAgg._count ?? 0,
        shareTransactionsValue: Number(shareTransactionAgg._sum?.fairMarketValue ?? 0),
        shareTransactionsConsideration: Number(shareTransactionAgg._sum?.considerationPaid ?? 0),
        statementsCount: statementAgg._count ?? 0,
        resolutionsCount,
        totalAssets: Number(statementAgg._sum?.totalAssets ?? 0),
        totalEquity: Number(statementAgg._sum?.totalEquity ?? 0),
        totalNetIncome: Number(statementAgg._sum?.netIncome ?? 0),
        latestStatement: latestStatement
            ? {
                id: latestStatement.id,
                companyId: latestStatement.companyId,
                companyName: latestStatement.company.name,
                periodEnd: latestStatement.periodEnd.toISOString(),
                statementType: latestStatement.statementType,
                netIncome: Number(latestStatement.netIncome ?? 0),
                totalEquity: Number(latestStatement.totalEquity ?? 0)
            }
            : null,
        latestResolution: latestResolution
            ? {
                id: latestResolution.id,
                companyId: latestResolution.companyId,
                companyName: latestResolution.company.name,
                resolutionDate: latestResolution.resolutionDate.toISOString(),
                type: latestResolution.type,
                title: latestResolution.title
            }
            : null
    };
    const personal = latestPersonalReturn
        ? {
            latestTaxYear: latestPersonalReturn.taxYear ?? null,
            shareholderId: latestPersonalReturn.shareholderId ?? null,
            taxableIncome: safeNumber(latestPersonalReturn.taxableIncome),
            employmentIncome: safeNumber(latestPersonalReturn.employmentIncome),
            businessIncome: safeNumber(latestPersonalReturn.businessIncome),
            eligibleDividends: safeNumber(latestPersonalReturn.eligibleDividends),
            nonEligibleDividends: safeNumber(latestPersonalReturn.nonEligibleDividends),
            capitalGains: safeNumber(latestPersonalReturn.capitalGains),
            deductions: safeNumber(latestPersonalReturn.deductions),
            federalTax: safeNumber(latestPersonalReturn.federalTax),
            provincialTax: safeNumber(latestPersonalReturn.provincialTax),
            balanceDue: safeNumber(latestPersonalReturn.balanceDue),
            returnsCount: personalReturnsCount,
            slipsCount: Array.isArray(latestPersonalReturn.slips)
                ? latestPersonalReturn.slips.length
                : 0,
            slipTypeCounts: Array.isArray(latestPersonalReturn.slips)
                ? Object.entries(latestPersonalReturn.slips.reduce((acc, s) => {
                    const key = (s.slipType || 'UNKNOWN').toUpperCase();
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                }, {})).map(([slipType, count]) => ({ slipType, count }))
                : []
        }
        : undefined;
    return { properties: propertySummaries, totals, corporate, personal };
}
async function buildSummaryForExport(userId) {
    const [summary, companyRecords] = await Promise.all([
        buildSummary(userId),
        prisma_1.prisma.company.findMany({
            where: { userId },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            include: {
                statements: {
                    include: {
                        lines: {
                            orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }]
                        }
                    },
                    orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }]
                },
                resolutions: {
                    orderBy: [{ resolutionDate: 'desc' }, { id: 'desc' }]
                }
            }
        })
    ]);
    const corporateDetails = companyRecords.map((company) => ({
        companyId: company.id,
        companyName: company.name,
        province: company.province ?? null,
        fiscalYearEnd: company.fiscalYearEnd ? company.fiscalYearEnd.toISOString() : null,
        statements: company.statements.map((statement) => ({
            id: statement.id,
            statementType: statement.statementType,
            periodStart: statement.periodStart.toISOString(),
            periodEnd: statement.periodEnd.toISOString(),
            isAudited: statement.isAudited,
            totals: {
                assets: safeNumber(statement.totalAssets),
                liabilities: safeNumber(statement.totalLiabilities),
                equity: safeNumber(statement.totalEquity),
                revenue: safeNumber(statement.totalRevenue),
                expenses: safeNumber(statement.totalExpenses),
                netIncome: safeNumber(statement.netIncome)
            },
            metadata: statement.metadata ?? null,
            createdAt: statement.createdAt.toISOString(),
            updatedAt: statement.updatedAt.toISOString(),
            lines: statement.lines.map((line) => ({
                id: line.id,
                category: line.category,
                label: line.label,
                amount: safeNumber(line.amount),
                orderIndex: line.orderIndex,
                metadata: line.metadata ?? null
            }))
        })),
        resolutions: company.resolutions.map((resolution) => ({
            id: resolution.id,
            type: resolution.type,
            title: resolution.title,
            resolutionDate: resolution.resolutionDate.toISOString(),
            body: resolution.body ?? null,
            metadata: resolution.metadata ?? null,
            createdAt: resolution.createdAt.toISOString(),
            updatedAt: resolution.updatedAt.toISOString()
        }))
    }));
    return {
        ...summary,
        corporateDetails
    };
}
