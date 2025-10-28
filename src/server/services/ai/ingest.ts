/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '../../lib/prisma';
import { env } from '../../env';
import { extractPersonalTaxReturn, extractRentalTaxSummaries } from '../../services/tax';
import { saveUserDocumentFile } from '../../services/documentStorage';
import type { RentalTaxFormType } from '@prisma/client';

type IngestDomain = 'personal-income' | 'property' | 'company';

export interface IngestRequest {
  userId: number;
  domain: IngestDomain;
  file: { buffer: Buffer; contentType: string; filename?: string };
  options?: {
    autoCreate?: boolean;
    shareholderId?: number;
    taxYear?: number;
  };
}

export async function ingestDocument(req: IngestRequest): Promise<any> {
  if (req.domain === 'personal-income') {
    return ingestPersonalIncome(req);
  }
  throw Object.assign(new Error(`Domaine non supporté: ${req.domain}`), { status: 501 });
}

function hasOpenAiKey(): boolean {
  const configuredKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  return typeof configuredKey === 'string' && configuredKey.trim().length > 0;
}

async function ensureShareholderOwnership(userId: number, shareholderId: number) {
  const shareholder = await prisma.shareholder.findFirst({
    where: { id: shareholderId, userId },
    select: { id: true, displayName: true }
  });
  return shareholder;
}

function normalizeCategory(input: string): string {
  const upper = input.trim().toUpperCase();
  const allowed = new Set([
    'EMPLOYMENT',
    'PENSION',
    'OAS',
    'CPP_QPP',
    'RRIF_RRSP',
    'BUSINESS',
    'ELIGIBLE_DIVIDEND',
    'NON_ELIGIBLE_DIVIDEND',
    'CAPITAL_GAIN',
    'OTHER'
  ]);
  return allowed.has(upper) ? upper : 'OTHER';
}

function parseAmount(input: unknown): number {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : 0;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return 0;
    // Normalise formats FR/EN: enlever espaces insécables, gérer virgule décimale
    // Cas 1: contient à la fois ',' et '.' → on suppose '.' pour décimales, supprimer les ',' de milliers
    if (s.includes(',') && s.includes('.')) {
      const cleaned = s.replace(/\s+/g, '').replace(/,/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
    // Cas 2: contient seulement ',' → virgule décimale
    if (s.includes(',')) {
      const cleaned = s.replace(/\s+/g, '').replace(/,/g, '.');
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    }
    const cleaned = s.replace(/\s+/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function ingestPersonalIncome(req: IngestRequest): Promise<any> {
  if (!hasOpenAiKey()) {
    throw Object.assign(
      new Error(
        "Extraction indisponible: configurez OPENAI_API_KEY (ou Azure équivalent) pour activer l'import IA."
      ),
      { status: 501 }
    );
  }

  // Sauvegarde du document importé
  const saved = await saveUserDocumentFile({ buffer: req.file.buffer, userId: req.userId, originalName: req.file.filename || 'document.pdf' });
  const createdDoc = await (prisma as any).uploadedDocument.create({
    data: {
      userId: req.userId,
      domain: 'personal-income',
      label: req.file.filename || 'Rapport impôt',
      originalName: req.file.filename || 'document.pdf',
      contentType: req.file.contentType,
      size: req.file.buffer.byteLength,
      storagePath: saved.storagePath,
      content: req.file.buffer,
      checksum: saved.checksum,
      taxYear: req.options?.taxYear ?? null,
      shareholderId: req.options?.shareholderId ?? null
    }
  });

  // Étape 1: extraction (mini)
  const extraction = await extractPersonalTaxReturn({
    buffer: req.file.buffer,
    contentType: req.file.contentType
  });

  const targetYear = req.options?.taxYear ?? extraction.taxYear;
  if (!targetYear) {
    throw Object.assign(new Error("Année d'imposition introuvable dans le document et non fournie."), {
      status: 422
    });
  }

  // Étape 2: revue/normalisation (modèle principal) — optionnelle; on garde la normalisation locale
  const items = (extraction.items || []).map((it: any) => ({
    category: normalizeCategory(String(it.category || 'OTHER')),
    label: String(it.label || '').trim(),
    amount: parseAmount(it.amount),
    source: it.source ? String(it.source) : null,
    slipType: it.slipType ? String(it.slipType) : null
  }));

  // Résolution de l'actionnaire (par défaut: créer/provisionner le profil personnel)
  let shareholderId = req.options?.shareholderId ?? null;
  if (!shareholderId) {
    const existing = await prisma.shareholder.findFirst({
      where: { userId: req.userId },
      orderBy: [{ id: 'asc' }],
      select: { id: true }
    });
    if (existing) {
      shareholderId = existing.id;
    } else {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
      const created = await prisma.shareholder.create({
        data: { userId: req.userId, displayName: 'Profil personnel', contactEmail: user?.email ?? null },
        select: { id: true }
      });
      shareholderId = created.id;
    }
  } else {
    const sh = await ensureShareholderOwnership(req.userId, shareholderId);
    if (!sh) {
      throw Object.assign(new Error('Actionnaire introuvable.'), { status: 404 });
    }
  }

  const createdIds: number[] = [];
  // Upsert du "PersonalTaxReturn" détaillé + lignes
  // Crée/Met à jour un return conteneur, lie le document et stocke l'extraction brute
  const taxReturn = await prisma.personalTaxReturn.upsert({
    where: { shareholderId_taxYear: { shareholderId: shareholderId!, taxYear: targetYear! } },
    update: { rawExtraction: extraction as any } as any,
    create: { shareholderId: shareholderId!, taxYear: targetYear!, rawExtraction: extraction as any } as any
  });
  // Lier le document si non présent (ajout séparé pour compatibilité types tant que le client Prisma n'est pas régénéré)
  if ((taxReturn as any).documentId == null) {
    await prisma.personalTaxReturn.update({ where: { id: taxReturn.id }, data: { documentId: createdDoc.id } as any });
  }
  // Purge et réinsère les lignes INCOME à partir des items extraits
  await (prisma as any).personalTaxReturnLine.deleteMany({ where: { returnId: taxReturn.id, section: 'INCOME' } });
  let order = 0;
  for (const it of items) {
    await (prisma as any).personalTaxReturnLine.create({
      data: {
        returnId: taxReturn.id,
        section: 'INCOME',
        code: it.slipType ? String(it.slipType) : null,
        label: it.label,
        amount: it.amount,
        orderIndex: order++,
        metadata: it.source ? { source: it.source } : undefined
      }
    });
  }
  // Purge et réinsère les FEUILLETS détaillés si présents
  await (prisma as any).taxSlip.deleteMany({ where: { returnId: taxReturn.id } });
  const slips = Array.isArray((extraction as any).slips) ? ((extraction as any).slips as any[]) : [];
  for (const s of slips) {
    const createdSlip = await (prisma as any).taxSlip.create({
      data: {
        returnId: taxReturn.id,
        slipType: String(s?.slipType || 'UNKNOWN'),
        issuer: s?.issuer ? String(s.issuer) : null,
        accountNumber: s?.accountNumber ? String(s.accountNumber) : null,
        documentId: createdDoc.id,
        metadata: s?.metadata && typeof s.metadata === 'object' ? s.metadata : undefined
      }
    });
    let liOrder = 0;
    const lines = Array.isArray(s?.lines) ? (s.lines as any[]) : [];
    for (const li of lines) {
      await (prisma as any).taxSlipLine.create({
        data: {
          slipId: createdSlip.id,
          code: typeof li?.code === 'string' ? li.code : null,
          label: String(li?.label || '').trim() || 'Ligne',
          amount: parseAmount(li?.amount),
          orderIndex: liOrder++,
          metadata: li?.metadata && typeof li.metadata === 'object' ? li.metadata : undefined
        }
      });
    }
  }
  if (req.options?.autoCreate) {
    for (const item of items) {
      if (!(item.label && item.amount > 0)) continue;
      // Déduplication simple: éviter doublons exacts label+amount+année
      const exists = await prisma.personalIncome.findFirst({
        where: {
          shareholderId: shareholderId!,
          taxYear: targetYear,
          label: item.label,
          amount: item.amount as any
        },
        select: { id: true }
      });
      if (!exists) {
        const created = await prisma.personalIncome.create({
          data: {
            shareholderId: shareholderId!,
            taxYear: targetYear,
            category: item.category,
            label: item.label,
            source: item.source,
            slipType: item.slipType,
            amount: item.amount
          },
          select: { id: true }
        });
        createdIds.push(created.id);
      }
    }
  }

  // Tentative: extraire aussi un résumé locatif (T776/TP-128) et pré-remplir un état par immeuble si détecté
  const rentalSummaries = await extractRentalTaxSummaries({
    buffer: req.file.buffer,
    contentType: req.file.contentType
  }).catch(() => [] as any[]);

  const createdRentalStatementIds: number[] = [];
  if (Array.isArray(rentalSummaries) && rentalSummaries.length > 0) {
    const props = await prisma.property.findMany({
      where: { userId: req.userId },
      select: { id: true, name: true, address: true }
    });

    function bestMatchPropertyId(propertyName?: string | null, propertyAddress?: string | null): number | null {
      const name = (propertyName ?? '').toLowerCase();
      const addr = (propertyAddress ?? '').toLowerCase();
      let bestId: number | null = null;
      let bestScore = 0;
      for (const p of props) {
        const pn = (p.name ?? '').toLowerCase();
        const pa = (p.address ?? '').toLowerCase();
        let score = 0;
        if (name && pn && (pn.includes(name) || name.includes(pn))) score += 2;
        if (addr) {
          if (pa && (pa.includes(addr) || addr.includes(pa))) score += 2;
          if (pn && addr.includes(pn)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestId = p.id;
        }
      }
      return bestId;
    }

    for (const r of rentalSummaries) {
      const formType: RentalTaxFormType = (r?.formType === 'TP128' ? 'TP128' : 'T776');
      const year = Number(r?.taxYear ?? targetYear);
      if (!Number.isFinite(year)) continue;

      const grossRents = parseAmount(r?.grossRents);
      const otherIncome = parseAmount(r?.otherIncome);
      const totalExpenses = parseAmount(r?.totalExpenses);
      const netIncome = parseAmount(r?.netIncome) || grossRents + otherIncome - totalExpenses;
      if (grossRents === 0 && otherIncome === 0 && totalExpenses === 0 && netIncome === 0) {
        continue;
      }

      const propertyId = bestMatchPropertyId(r?.propertyName, r?.propertyAddress);

      const payload = {
        metadata: [
          r?.propertyAddress
            ? { key: 'propertyAddress', label: "Adresse de l'immeuble", type: 'textarea', value: r.propertyAddress }
            : undefined,
          { key: 'taxYear', label: 'Année fiscale', type: 'number', value: year }
        ].filter(Boolean),
        income: { grossRents, otherIncome, totalIncome: grossRents + otherIncome },
        expenses: [
          { key: 'other', label: 'Autres dépenses', amount: totalExpenses }
        ],
        totals: { totalExpenses, netIncome }
      } as any;

      const computed = {
        grossRents,
        otherIncome,
        totalIncome: grossRents + otherIncome,
        expenses: [{ key: 'other', label: 'Autres dépenses', amount: totalExpenses }],
        totalExpenses,
        netIncome,
        mortgageInterest: 0,
        capitalCostAllowance: 0,
        incomeDetails: [],
        ccaDetails: []
      } as any;

      const created = await prisma.rentalTaxStatement.create({
        data: {
          userId: req.userId,
          propertyId: propertyId ?? null,
          formType,
          taxYear: year,
          payload: payload as any,
          computed: computed as any,
          notes: r?.propertyName ? `Import IA – ${r.propertyName}` : 'Import IA – Résumé locatif'
        }
      });
      createdRentalStatementIds.push(created.id);
    }
  }

  return {
    shareholderId,
    taxYear: targetYear,
    extracted: items,
    createdIds,
    rentalStatements: createdRentalStatementIds,
    documentId: createdDoc.id,
    taxReturnId: taxReturn.id
  };
}
