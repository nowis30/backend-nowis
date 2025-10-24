"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExpensesFiscalReport = buildExpensesFiscalReport;
exports.expensesFiscalReportToCsv = expensesFiscalReportToCsv;
const prisma_1 = require("../lib/prisma");
const SUPPORTED_FREQUENCIES = [
    'PONCTUEL',
    'HEBDOMADAIRE',
    'MENSUEL',
    'TRIMESTRIEL',
    'ANNUEL'
];
const RECURRING_FREQUENCIES = [
    'HEBDOMADAIRE',
    'MENSUEL',
    'TRIMESTRIEL',
    'ANNUEL'
];
function addInterval(date, frequency) {
    const next = new Date(date.getTime());
    switch (frequency) {
        case 'HEBDOMADAIRE': {
            next.setDate(next.getDate() + 7);
            break;
        }
        case 'MENSUEL': {
            next.setMonth(next.getMonth() + 1);
            break;
        }
        case 'TRIMESTRIEL': {
            next.setMonth(next.getMonth() + 3);
            break;
        }
        case 'ANNUEL': {
            next.setFullYear(next.getFullYear() + 1);
            break;
        }
        default: {
            throw new Error(`Unsupported frequency increment: ${frequency}`);
        }
    }
    return next;
}
function countOccurrences(expense, year) {
    const frequency = (expense.frequency ?? 'PONCTUEL').toUpperCase();
    const start = new Date(expense.startDate);
    const end = expense.endDate ? new Date(expense.endDate) : null;
    const windowStart = new Date(Date.UTC(year, 0, 1));
    const windowEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    if (end && end.getTime() < windowStart.getTime()) {
        return 0;
    }
    if (start.getTime() > windowEnd.getTime()) {
        return 0;
    }
    if (frequency === 'PONCTUEL') {
        return start >= windowStart && start <= windowEnd ? 1 : 0;
    }
    if (!RECURRING_FREQUENCIES.includes(frequency)) {
        return 0;
    }
    const effectiveEnd = end && end.getTime() < windowEnd.getTime() ? end : windowEnd;
    if (effectiveEnd.getTime() < windowStart.getTime()) {
        return 0;
    }
    let current = new Date(start.getTime());
    const maxIterations = 10000;
    let guard = 0;
    while (current < windowStart && current <= effectiveEnd) {
        const next = addInterval(current, frequency);
        if (next.getTime() === current.getTime()) {
            break;
        }
        current = next;
        guard += 1;
        if (guard > maxIterations) {
            break;
        }
    }
    if (current.getTime() < windowStart.getTime()) {
        current = new Date(windowStart.getTime());
    }
    let occurrences = 0;
    guard = 0;
    while (current <= effectiveEnd && current <= windowEnd) {
        occurrences += 1;
        const next = addInterval(current, frequency);
        if (next.getTime() === current.getTime()) {
            break;
        }
        current = next;
        guard += 1;
        if (guard > maxIterations) {
            break;
        }
    }
    return occurrences;
}
function sumDecimals(values) {
    return values.reduce((acc, value) => acc + Number(value ?? 0), 0);
}
async function buildExpensesFiscalReport(userId, year) {
    const expenses = (await prisma_1.prisma.expense.findMany({
        where: { property: { userId } },
        include: { property: { select: { id: true, name: true } } }
    }));
    const propertyMap = new Map();
    expenses.forEach((expense) => {
        const frequency = (expense.frequency ?? 'PONCTUEL').toUpperCase();
        if (!SUPPORTED_FREQUENCIES.includes(frequency)) {
            return;
        }
        const occurrences = countOccurrences(expense, year);
        if (occurrences === 0) {
            return;
        }
        const unitAmount = Number(expense.amount ?? 0);
        if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
            return;
        }
        const totalAmount = unitAmount * occurrences;
        let propertyEntry = propertyMap.get(expense.propertyId);
        if (!propertyEntry) {
            propertyEntry = {
                propertyId: expense.propertyId,
                propertyName: expense.property.name,
                totalAmount: 0,
                categories: []
            };
            propertyMap.set(expense.propertyId, propertyEntry);
        }
        const normalizedCategory = expense.category.trim();
        let categoryEntry = propertyEntry.categories.find((category) => category.category.toLowerCase() === normalizedCategory.toLowerCase());
        if (!categoryEntry) {
            categoryEntry = {
                category: normalizedCategory,
                totalAmount: 0,
                items: []
            };
            propertyEntry.categories.push(categoryEntry);
        }
        categoryEntry.items.push({
            expenseId: expense.id,
            label: expense.label,
            frequency,
            occurrences,
            unitAmount,
            totalAmount,
            startDate: expense.startDate.toISOString(),
            endDate: expense.endDate ? expense.endDate.toISOString() : null
        });
        categoryEntry.totalAmount += totalAmount;
        propertyEntry.totalAmount += totalAmount;
    });
    const properties = Array.from(propertyMap.values())
        .map((property) => ({
        ...property,
        categories: property.categories
            .map((category) => ({
            ...category,
            items: category.items.sort((a, b) => a.label.localeCompare(b.label, 'fr'))
        }))
            .sort((a, b) => a.category.localeCompare(b.category, 'fr'))
    }))
        .sort((a, b) => a.propertyName.localeCompare(b.propertyName, 'fr'));
    const totalAmount = sumDecimals(properties.map((property) => property.totalAmount));
    return {
        year,
        generatedAt: new Date().toISOString(),
        totalAmount,
        properties
    };
}
function escapeCsvCell(value) {
    const sanitized = value.replace(/"/g, '""');
    return `"${sanitized}"`;
}
function expensesFiscalReportToCsv(report) {
    const headers = [
        'Immeuble',
        'Catégorie',
        'Libellé',
        'Fréquence',
        'Occurrences',
        'Montant unitaire',
        'Total annuel',
        'Début',
        'Fin'
    ];
    const rows = [];
    report.properties.forEach((property) => {
        property.categories.forEach((category) => {
            category.items.forEach((item) => {
                rows.push([
                    property.propertyName,
                    category.category,
                    item.label,
                    item.frequency,
                    item.occurrences.toString(),
                    item.unitAmount.toFixed(2),
                    item.totalAmount.toFixed(2),
                    item.startDate.slice(0, 10),
                    item.endDate ? item.endDate.slice(0, 10) : ''
                ]);
            });
            rows.push([
                property.propertyName,
                category.category,
                'TOTAL CATÉGORIE',
                '',
                '',
                '',
                category.totalAmount.toFixed(2),
                '',
                ''
            ]);
        });
        rows.push([
            property.propertyName,
            '',
            'TOTAL IMMEUBLE',
            '',
            '',
            '',
            property.totalAmount.toFixed(2),
            '',
            ''
        ]);
    });
    rows.push(['TOTAL', '', '', '', '', '', report.totalAmount.toFixed(2), '', '']);
    return [headers, ...rows]
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
        .join('\r\n');
}
