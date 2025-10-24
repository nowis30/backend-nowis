"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateScheduledPayment = calculateScheduledPayment;
exports.buildAmortizationSchedule = buildAmortizationSchedule;
exports.calculateMortgagePeriod = calculateMortgagePeriod;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function roundToCents(value) {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
function calculateTotalPeriods(amortizationMonths, paymentFrequency) {
    if (amortizationMonths <= 0 || paymentFrequency <= 0) {
        return 0;
    }
    return Math.max(0, Math.round((amortizationMonths / 12) * paymentFrequency));
}
function addMonthsSafe(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + months);
    if (next.getDate() < day) {
        next.setDate(0);
    }
    return next;
}
function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
}
function advancePaymentDate(previous, frequency) {
    switch (frequency) {
        case 12:
            return addMonthsSafe(previous, 1);
        case 24:
            return addDays(previous, 15);
        case 26:
            return addDays(previous, 14);
        case 52:
            return addDays(previous, 7);
        case 4:
            return addMonthsSafe(previous, 3);
        case 2:
            return addMonthsSafe(previous, 6);
        case 1:
            return addMonthsSafe(previous, 12);
        default:
            return addDays(previous, Math.round(365 / Math.max(1, frequency)));
    }
}
function toNumber(value) {
    return Number(value ?? 0);
}
function calculateElapsedPeriods(startDate, paymentFrequency, amortizationMonths) {
    if (paymentFrequency <= 0) {
        return 0;
    }
    const now = new Date();
    if (now <= startDate) {
        return 0;
    }
    const totalPeriods = calculateTotalPeriods(amortizationMonths, paymentFrequency);
    const msPerPeriod = (365 / paymentFrequency) * MS_PER_DAY;
    const elapsed = Math.floor((now.getTime() - startDate.getTime()) / msPerPeriod);
    return Math.max(0, Math.min(totalPeriods, elapsed));
}
function calculateScheduledPayment({ principal, rateAnnual, amortizationMonths, paymentFrequency }) {
    const balance = toNumber(principal);
    const frequency = Number(paymentFrequency ?? 0);
    const months = Number(amortizationMonths ?? 0);
    if (balance <= 0 || frequency <= 0 || months <= 0) {
        return 0;
    }
    const totalPeriods = calculateTotalPeriods(months, frequency);
    if (totalPeriods <= 0) {
        return 0;
    }
    const ratePerPeriod = Number(rateAnnual ?? 0) / frequency;
    if (ratePerPeriod === 0) {
        return roundToCents(balance / totalPeriods);
    }
    const numerator = balance * ratePerPeriod;
    const denominator = 1 - Math.pow(1 + ratePerPeriod, -totalPeriods);
    if (denominator === 0) {
        return roundToCents(balance / totalPeriods);
    }
    return roundToCents(numerator / denominator);
}
function buildAmortizationSchedule(mortgage, explicitPayment) {
    const principal = Math.max(0, toNumber(mortgage.principal));
    const frequency = Number(mortgage.paymentFrequency ?? 0);
    const months = Number(mortgage.amortizationMonths ?? 0);
    const startDate = new Date(mortgage.startDate);
    const totalPeriods = calculateTotalPeriods(months, frequency);
    if (principal <= 0 || frequency <= 0 || months <= 0 || totalPeriods === 0) {
        return {
            paymentAmount: 0,
            totalPeriods: 0,
            payoffDate: null,
            totalPrincipal: 0,
            totalInterest: 0,
            totalPaid: 0,
            termSummary: {
                periods: 0,
                endDate: null,
                totalPrincipal: 0,
                totalInterest: 0,
                balanceRemaining: principal
            },
            annualBreakdown: [],
            schedule: []
        };
    }
    const ratePerPeriod = Number(mortgage.rateAnnual ?? 0) / frequency;
    const scheduledPayment = explicitPayment ?? calculateScheduledPayment({
        principal,
        rateAnnual: mortgage.rateAnnual,
        amortizationMonths: months,
        paymentFrequency: frequency
    });
    const schedule = [];
    let balance = principal;
    let paymentDate = new Date(startDate.getTime());
    let totalPrincipal = 0;
    let totalInterest = 0;
    for (let period = 1; period <= totalPeriods; period += 1) {
        const interestPortion = roundToCents(balance * ratePerPeriod);
        const maxPayment = roundToCents(balance + interestPortion);
        const paymentAmount = roundToCents(Math.min(scheduledPayment, maxPayment));
        const principalPortion = roundToCents(paymentAmount - interestPortion);
        balance = roundToCents(balance - principalPortion);
        if (balance < 0.01) {
            balance = 0;
        }
        totalPrincipal += principalPortion;
        totalInterest += interestPortion;
        schedule.push({
            periodIndex: period,
            paymentDate: paymentDate.toISOString(),
            paymentAmount,
            interestPortion,
            principalPortion,
            remainingBalance: balance
        });
        if (balance === 0) {
            break;
        }
        paymentDate = advancePaymentDate(paymentDate, frequency);
    }
    const payoffDate = schedule.length > 0 ? schedule[schedule.length - 1].paymentDate : null;
    const termMonths = Number(mortgage.termMonths ?? 0);
    const termPeriods = termMonths > 0 ? Math.min(schedule.length, Math.max(0, Math.round((termMonths / 12) * frequency))) : 0;
    let termPrincipal = 0;
    let termInterest = 0;
    let termEndDate = null;
    let balanceAfterTerm = balance;
    if (termPeriods > 0) {
        const termSlice = schedule.slice(0, termPeriods);
        termPrincipal = termSlice.reduce((acc, item) => acc + item.principalPortion, 0);
        termInterest = termSlice.reduce((acc, item) => acc + item.interestPortion, 0);
        termEndDate = termSlice[termSlice.length - 1]?.paymentDate ?? null;
        balanceAfterTerm = termSlice[termSlice.length - 1]?.remainingBalance ?? principal;
    }
    const annualMap = new Map();
    schedule.forEach((entry) => {
        const year = new Date(entry.paymentDate).getFullYear();
        const aggregate = annualMap.get(year) ?? { interest: 0, principal: 0, balance: entry.remainingBalance };
        aggregate.interest += entry.interestPortion;
        aggregate.principal += entry.principalPortion;
        aggregate.balance = entry.remainingBalance;
        annualMap.set(year, aggregate);
    });
    const annualBreakdown = Array.from(annualMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([year, values]) => ({
        year,
        totalInterest: roundToCents(values.interest),
        totalPrincipal: roundToCents(values.principal),
        endingBalance: roundToCents(values.balance)
    }));
    return {
        paymentAmount: scheduledPayment,
        totalPeriods: schedule.length,
        payoffDate,
        totalPrincipal: roundToCents(totalPrincipal),
        totalInterest: roundToCents(totalInterest),
        totalPaid: roundToCents(totalPrincipal + totalInterest),
        termSummary: {
            periods: termPeriods,
            endDate: termEndDate,
            totalPrincipal: roundToCents(termPrincipal),
            totalInterest: roundToCents(termInterest),
            balanceRemaining: roundToCents(balanceAfterTerm)
        },
        annualBreakdown,
        schedule
    };
}
function calculateMortgagePeriod(mortgage) {
    const paymentsPerYear = mortgage.paymentFrequency;
    const ratePerPeriod = Number(mortgage.rateAnnual ?? 0) / Math.max(1, paymentsPerYear);
    const scheduledPayment = (typeof mortgage.paymentAmount !== 'undefined' && toNumber(mortgage.paymentAmount) > 0
        ? toNumber(mortgage.paymentAmount)
        : calculateScheduledPayment({
            principal: mortgage.principal,
            rateAnnual: mortgage.rateAnnual,
            amortizationMonths: mortgage.amortizationMonths,
            paymentFrequency: paymentsPerYear
        }));
    const amortizationMonths = mortgage.amortizationMonths ?? 0;
    let balance = Math.max(0, toNumber(mortgage.principal));
    const paymentsMade = calculateElapsedPeriods(new Date(mortgage.startDate), paymentsPerYear, amortizationMonths);
    for (let i = 0; i < paymentsMade; i += 1) {
        const interest = balance * ratePerPeriod;
        const payment = Math.min(scheduledPayment, balance + interest);
        const principal = Math.max(0, payment - interest);
        balance = Math.max(0, balance - principal);
        if (balance === 0) {
            break;
        }
    }
    const interestCurrent = balance * ratePerPeriod;
    const paymentCurrent = Math.min(scheduledPayment, balance + interestCurrent);
    const principalCurrent = Math.max(0, paymentCurrent - interestCurrent);
    const balanceAfterPayment = Math.max(0, balance - principalCurrent);
    return {
        payment: roundToCents(paymentCurrent),
        interest: roundToCents(interestCurrent),
        principal: roundToCents(principalCurrent),
        outstandingBalance: roundToCents(balance),
        balanceAfterPayment: roundToCents(balanceAfterPayment)
    };
}
