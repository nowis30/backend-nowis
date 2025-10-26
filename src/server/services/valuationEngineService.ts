import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

const prismaClient = prisma;

interface ValuationSnapshotRecord {
  id: number;
  companyId: number | null;
  valuationDate: Date;
  totals: Prisma.JsonValue;
  properties: Prisma.JsonValue;
  shareClasses: Prisma.JsonValue;
  shareholderEquity: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  company?: {
    id: number;
    name: string;
  } | null;
}

interface ValuationTotals {
  totalMarketValue: number;
  totalDebt: number;
  netAssetValue: number;
}

export interface ValuationPropertyEntry {
  propertyId: number;
  name: string;
  address: string | null;
  marketValue: number;
  debtOutstanding: number;
  netValue: number;
}

export interface ShareClassValuationEntry {
  shareClassId: number;
  code: string;
  description: string | null;
  participatesInGrowth: boolean;
  totalShares: number;
  pricePerShare: number;
  totalValue: number;
}

export interface ShareholderEquityBreakdownEntry {
  shareClassId: number;
  shareClassCode: string;
  participatesInGrowth: boolean;
  shares: number;
  equityValue: number;
}

export interface ShareholderEquityEntry {
  shareholderId: number;
  displayName: string;
  totalShares: number;
  participatingShares: number;
  ownershipPercent: number;
  equityValue: number;
  breakdown: ShareholderEquityBreakdownEntry[];
}

export interface ValuationComputation {
  companyId: number;
  companyName: string;
  valuationDate: Date;
  totals: ValuationTotals;
  properties: ValuationPropertyEntry[];
  shareClasses: ShareClassValuationEntry[];
  shareholders: ShareholderEquityEntry[];
}

export interface ValuationSnapshotDto {
  id: number;
  companyId: number | null;
  companyName: string | null;
  valuationDate: string;
  totals: ValuationTotals;
  properties: ValuationPropertyEntry[];
  shareClasses: ShareClassValuationEntry[];
  shareholders: ShareholderEquityEntry[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ComputeValuationParams {
  userId: number;
  companyId: number;
  valuationDate?: Date;
}

interface CreateSnapshotParams extends ComputeValuationParams {
  notes?: string | null;
}

const REMOVAL_TRANSACTION_TYPES = new Set([
  'REDEMPTION',
  'RACHAT',
  'BUYBACK',
  'CANCELLATION',
  'ANNULATION',
  'SALE',
  'VENTE',
  'TRANSFER_OUT',
  'TRANSFERT_SORTANT',
  'DONATION_OUT',
  'ADJUSTMENT_OUT',
  'AJUSTEMENT_NEGATIF'
]);

function normalizeTransactionType(type: string): string {
  return type.trim().toUpperCase();
}

function determineQuantityDirection(type: string): number {
  const normalized = normalizeTransactionType(type);

  if (REMOVAL_TRANSACTION_TYPES.has(normalized)) {
    return -1;
  }

  return 1;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  return value.toNumber();
}

function roundToCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function computeCompanyValuation({
  userId,
  companyId,
  valuationDate
}: ComputeValuationParams): Promise<ValuationComputation> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, userId },
    select: { id: true, name: true }
  });

  if (!company) {
    throw new Error('Entreprise introuvable ou non autorisée.');
  }

  const asOf = valuationDate ?? new Date();

  const propertyRecords = await prisma.property.findMany({
    where: { companyId: company.id, userId },
    select: {
      id: true,
      name: true,
      address: true,
      currentValue: true,
      purchasePrice: true,
      mortgages: {
        select: {
          principal: true
        }
      }
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }]
  });

  const properties: ValuationPropertyEntry[] = propertyRecords.map((property) => {
    const marketValueRaw = property.currentValue ?? property.purchasePrice ?? 0;
    const marketValue = roundToCents(decimalToNumber(marketValueRaw));

    const debtOutstanding = roundToCents(
      property.mortgages.reduce((total, mortgage) => total + decimalToNumber(mortgage.principal), 0)
    );

    const netValue = roundToCents(marketValue - debtOutstanding);

    return {
      propertyId: property.id,
      name: property.name,
      address: property.address ?? null,
      marketValue,
      debtOutstanding,
      netValue
    };
  });

  const totals: ValuationTotals = properties.reduce(
    (accumulator, property) => ({
      totalMarketValue: roundToCents(accumulator.totalMarketValue + property.marketValue),
      totalDebt: roundToCents(accumulator.totalDebt + property.debtOutstanding),
      netAssetValue: roundToCents(accumulator.netAssetValue + property.netValue)
    }),
    { totalMarketValue: 0, totalDebt: 0, netAssetValue: 0 }
  );

  const shareClasses = await prisma.shareClass.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      code: true,
      description: true,
      participatesInGrowth: true
    },
    orderBy: [{ code: 'asc' }, { id: 'asc' }]
  });

  const shareTransactions = await prisma.shareTransaction.findMany({
    where: { companyId: company.id },
    select: {
      shareClassId: true,
      quantity: true,
      type: true,
      shareholderId: true,
      shareholder: {
        select: {
          id: true,
          displayName: true
        }
      }
    }
  });

  const shareClassMap = new Map<number, ShareClassValuationEntry>();
  shareClasses.forEach((shareClass) => {
    shareClassMap.set(shareClass.id, {
      shareClassId: shareClass.id,
      code: shareClass.code,
      description: shareClass.description ?? null,
      participatesInGrowth: shareClass.participatesInGrowth,
      totalShares: 0,
      pricePerShare: 0,
      totalValue: 0
    });
  });

  const shareholderMap = new Map<
    number,
    {
      displayName: string;
      breakdown: Map<number, { shares: number; participatesInGrowth: boolean; shareClassCode: string }>;
    }
  >();

  shareTransactions.forEach((transaction) => {
    const shareClassEntry = shareClassMap.get(transaction.shareClassId);
    if (!shareClassEntry) {
      return;
    }

    const direction = determineQuantityDirection(transaction.type ?? '');
    const quantity = roundToCents(decimalToNumber(transaction.quantity) * direction);

    shareClassEntry.totalShares = roundToCents(shareClassEntry.totalShares + quantity);

    const shareholderId = transaction.shareholderId;
    if (!shareholderMap.has(shareholderId)) {
      shareholderMap.set(shareholderId, {
        displayName: transaction.shareholder?.displayName ?? 'Actionnaire inconnu',
        breakdown: new Map()
      });
    }

    const shareholderEntry = shareholderMap.get(shareholderId);
    if (!shareholderEntry) {
      return;
    }

    const existingBreakdown = shareholderEntry.breakdown.get(transaction.shareClassId);
    if (existingBreakdown) {
      existingBreakdown.shares = roundToCents(existingBreakdown.shares + quantity);
    } else {
      shareholderEntry.breakdown.set(transaction.shareClassId, {
        shares: quantity,
        participatesInGrowth: shareClassEntry.participatesInGrowth,
        shareClassCode: shareClassEntry.code
      });
    }
  });

  const totalParticipatingShares = Array.from(shareClassMap.values())
    .filter((entry) => entry.participatesInGrowth)
    .reduce((total, entry) => roundToCents(total + Math.max(entry.totalShares, 0)), 0);

  const pricePerParticipatingShare = totalParticipatingShares > 0 ? roundToCents(totals.netAssetValue / totalParticipatingShares) : 0;

  shareClassMap.forEach((entry) => {
    if (entry.participatesInGrowth && totalParticipatingShares > 0) {
      entry.pricePerShare = pricePerParticipatingShare;
      entry.totalValue = roundToCents(Math.max(entry.totalShares, 0) * pricePerParticipatingShare);
    } else {
      entry.pricePerShare = 0;
      entry.totalValue = 0;
    }
  });

  const shareholders: ShareholderEquityEntry[] = Array.from(shareholderMap.entries())
    .map(([shareholderId, data]) => {
      let totalShares = 0;
      let participatingShares = 0;
      let equityValue = 0;

      const breakdown: ShareholderEquityBreakdownEntry[] = Array.from(data.breakdown.entries()).map(
        ([shareClassId, breakdownEntry]) => {
          const shareClassValuation = shareClassMap.get(shareClassId);
          const pricePerShare = shareClassValuation?.pricePerShare ?? 0;
          const shares = roundToCents(breakdownEntry.shares);
          const partialValue = roundToCents(shares * pricePerShare);

          totalShares = roundToCents(totalShares + shares);
          if (breakdownEntry.participatesInGrowth) {
            participatingShares = roundToCents(participatingShares + shares);
            equityValue = roundToCents(equityValue + partialValue);
          }

          return {
            shareClassId,
            shareClassCode: breakdownEntry.shareClassCode,
            participatesInGrowth: breakdownEntry.participatesInGrowth,
            shares,
            equityValue: partialValue
          };
        }
      );

      const ownershipPercent = totalParticipatingShares > 0 ? roundToCents((participatingShares / totalParticipatingShares) * 100) : 0;

      return {
        shareholderId,
        displayName: data.displayName,
        totalShares,
        participatingShares,
        ownershipPercent,
        equityValue,
        breakdown
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const shareClassesValuation = Array.from(shareClassMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  return {
    companyId: company.id,
    companyName: company.name,
    valuationDate: asOf,
    totals,
    properties,
    shareClasses: shareClassesValuation,
    shareholders
  };
}

export async function createValuationSnapshot({
  userId,
  companyId,
  valuationDate,
  notes
}: CreateSnapshotParams): Promise<ValuationSnapshotDto> {
  const computation = await computeCompanyValuation({ userId, companyId, valuationDate });

  const created = await prismaClient.valuationSnapshot.create({
    data: {
      userId,
      companyId: computation.companyId,
      valuationDate: computation.valuationDate,
      totals: toJsonValue(computation.totals),
      properties: toJsonValue(computation.properties),
      shareClasses: toJsonValue(computation.shareClasses),
      shareholderEquity: toJsonValue(computation.shareholders),
      notes: notes ?? null
    }
  });

  return {
    id: created.id,
    companyId: created.companyId,
    companyName: computation.companyName,
    valuationDate: created.valuationDate.toISOString(),
    totals: computation.totals,
    properties: computation.properties,
    shareClasses: computation.shareClasses,
    shareholders: computation.shareholders,
    notes: created.notes ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString()
  };
}

export async function listValuationSnapshots(userId: number, companyId?: number): Promise<ValuationSnapshotDto[]> {
  const snapshots = (await prismaClient.valuationSnapshot.findMany({
    where: {
      userId,
      companyId: companyId ?? undefined
    },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ valuationDate: 'desc' }, { id: 'desc' }]
  })) as ValuationSnapshotRecord[];

  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    companyId: snapshot.companyId,
    companyName: snapshot.company?.name ?? null,
    valuationDate: snapshot.valuationDate.toISOString(),
    totals: snapshot.totals as unknown as ValuationTotals,
    properties: snapshot.properties as unknown as ValuationPropertyEntry[],
    shareClasses: snapshot.shareClasses as unknown as ShareClassValuationEntry[],
    shareholders: snapshot.shareholderEquity as unknown as ShareholderEquityEntry[],
    notes: snapshot.notes ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString()
  }));
}

export async function getValuationSnapshot(userId: number, snapshotId: number): Promise<ValuationSnapshotDto | null> {
  const snapshot = (await prismaClient.valuationSnapshot.findFirst({
    where: { id: snapshotId, userId },
    include: {
      company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })) as ValuationSnapshotRecord | null;

  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    companyId: snapshot.companyId,
    companyName: snapshot.company?.name ?? null,
    valuationDate: snapshot.valuationDate.toISOString(),
    totals: snapshot.totals as unknown as ValuationTotals,
    properties: snapshot.properties as unknown as ValuationPropertyEntry[],
    shareClasses: snapshot.shareClasses as unknown as ShareClassValuationEntry[],
    shareholders: snapshot.shareholderEquity as unknown as ShareholderEquityEntry[],
    notes: snapshot.notes ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString()
  };
}

export async function deleteValuationSnapshot(userId: number, snapshotId: number): Promise<boolean> {
  const result = await prismaClient.valuationSnapshot.deleteMany({
    where: { id: snapshotId, userId }
  });

  return result.count > 0;
}

function escapeCsvValue(value: string | number | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  const asString = typeof value === 'number' ? value.toString() : value;
  if (/[",\n]/.test(asString)) {
    return `"${asString.replace(/"/g, '""')}"`;
  }

  return asString;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

export function buildValuationSnapshotCsv(snapshot: ValuationSnapshotDto): string {
  const lines: string[] = [];

  lines.push('Section,Nom,Détail,Valeur');
  lines.push(
    ['Meta', 'Entreprise', escapeCsvValue(snapshot.companyName ?? '—'), ''].join(',')
  );
  lines.push(['Meta', "Date d'évaluation", '', escapeCsvValue(snapshot.valuationDate)].join(','));
  lines.push(['Meta', 'Valeur nette', '', escapeCsvValue(formatNumber(snapshot.totals.netAssetValue))].join(','));
  lines.push('');

  lines.push(['Section Immeubles', '', '', ''].join(','));
  snapshot.properties.forEach((property) => {
    lines.push(
      [
        'Immeuble',
        escapeCsvValue(property.name),
        'Valeur marchande',
        escapeCsvValue(formatNumber(property.marketValue))
      ].join(',')
    );
    lines.push([
      'Immeuble',
      escapeCsvValue(property.name),
      'Dettes',
      escapeCsvValue(formatNumber(property.debtOutstanding))
    ].join(','));
    lines.push([
      'Immeuble',
      escapeCsvValue(property.name),
      'Valeur nette',
      escapeCsvValue(formatNumber(property.netValue))
    ].join(','));
  });
  lines.push([
    'Immeuble total',
    '',
    'Valeur marchande totale',
    escapeCsvValue(formatNumber(snapshot.totals.totalMarketValue))
  ].join(','));
  lines.push([
    'Immeuble total',
    '',
    'Dettes totales',
    escapeCsvValue(formatNumber(snapshot.totals.totalDebt))
  ].join(','));
  lines.push([
    'Immeuble total',
    '',
    'Valeur nette totale',
    escapeCsvValue(formatNumber(snapshot.totals.netAssetValue))
  ].join(','));
  lines.push('');

  lines.push(["Section Classes d'actions", '', '', ''].join(','));
  snapshot.shareClasses.forEach((entry) => {
    lines.push([
      'Classe',
      escapeCsvValue(entry.code),
      'Actions en circulation',
      escapeCsvValue(formatNumber(entry.totalShares))
    ].join(','));
    lines.push([
      'Classe',
      escapeCsvValue(entry.code),
      'Prix par action',
      escapeCsvValue(formatNumber(entry.pricePerShare))
    ].join(','));
    lines.push([
      'Classe',
      escapeCsvValue(entry.code),
      'Valeur totale',
      escapeCsvValue(formatNumber(entry.totalValue))
    ].join(','));
    lines.push([
      'Classe',
      escapeCsvValue(entry.code),
      'Participe à la croissance',
      escapeCsvValue(entry.participatesInGrowth ? 'Oui' : 'Non')
    ].join(','));
  });
  lines.push('');

  lines.push(['Section Actionnaires', '', '', ''].join(','));
  snapshot.shareholders.forEach((shareholder) => {
    lines.push([
      'Actionnaire',
      escapeCsvValue(shareholder.displayName),
      'Actions totales',
      escapeCsvValue(formatNumber(shareholder.totalShares))
    ].join(','));
    lines.push([
      'Actionnaire',
      escapeCsvValue(shareholder.displayName),
      '% participation',
      escapeCsvValue(formatNumber(shareholder.ownershipPercent))
    ].join(','));
    lines.push([
      'Actionnaire',
      escapeCsvValue(shareholder.displayName),
      'Valeur des actions',
      escapeCsvValue(formatNumber(shareholder.equityValue))
    ].join(','));

    shareholder.breakdown.forEach((breakdownEntry) => {
      lines.push([
        'Actionnaire détaillé',
        escapeCsvValue(shareholder.displayName),
        `${breakdownEntry.shareClassCode} · Actions`,
        escapeCsvValue(formatNumber(breakdownEntry.shares))
      ].join(','));
      lines.push([
        'Actionnaire détaillé',
        escapeCsvValue(shareholder.displayName),
        `${breakdownEntry.shareClassCode} · Valeur`,
        escapeCsvValue(formatNumber(breakdownEntry.equityValue))
      ].join(','));
    });
  });

  if (snapshot.notes) {
    lines.push('');
    lines.push(['Notes', '', '', escapeCsvValue(snapshot.notes)].join(','));
  }

  return lines.join('\r\n');
}

export interface ShareholderHistoryPoint {
  valuationDate: string;
  equityValue: number;
  ownershipPercent: number;
}

export interface ShareholderHistoryEntry {
  shareholderId: number;
  displayName: string;
  timeline: ShareholderHistoryPoint[];
}

export function buildShareholderHistory(snapshots: ValuationSnapshotDto[]): ShareholderHistoryEntry[] {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.valuationDate).getTime() - new Date(b.valuationDate).getTime()
  );

  const historyMap = new Map<number, ShareholderHistoryEntry>();

  sorted.forEach((snapshot) => {
    snapshot.shareholders.forEach((shareholder) => {
      if (!historyMap.has(shareholder.shareholderId)) {
        historyMap.set(shareholder.shareholderId, {
          shareholderId: shareholder.shareholderId,
          displayName: shareholder.displayName,
          timeline: []
        });
      }

      const entry = historyMap.get(shareholder.shareholderId);
      if (!entry) {
        return;
      }

      entry.timeline.push({
        valuationDate: snapshot.valuationDate,
        equityValue: shareholder.equityValue,
        ownershipPercent: shareholder.ownershipPercent
      });
    });
  });

  return Array.from(historyMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
