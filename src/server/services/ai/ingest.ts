/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '../../lib/prisma';
import { env } from '../../env';
import { extractPersonalTaxReturn, extractRentalTaxSummaries } from '../../services/tax';
import { saveUserDocumentFile } from '../../services/documentStorage';
import type { RentalTaxFormType } from '@prisma/client';
import { logger } from '../../lib/logger';

type IngestDomain = 'personal-income' | 'property' | 'company';

export interface IngestRequest {
  userId: number;
  domain: IngestDomain;
  file: { buffer: Buffer; contentType: string; filename?: string };
  options?: {
    autoCreate?: boolean;
    postToLedger?: boolean;
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
  // Déduplication de document par checksum (même fichier importé)
  const existingDoc = await (prisma as any).uploadedDocument.findFirst({
    where: { userId: req.userId, domain: 'personal-income', checksum: saved.checksum }
  });
  const createdDoc = existingDoc ?? (await (prisma as any).uploadedDocument.create({
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
  }));

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

  // Mise à jour du profil (identité) si le document fournit des métadonnées fiables
  try {
    const idt = (extraction as any)?.identity as
      | { fullName?: string; address?: string; birthDate?: string; phone?: string; sin?: string }
      | undefined;
    if (idt && shareholderId) {
      const updates: any = {};
      if (idt.fullName && idt.fullName.trim().length >= 2) updates.displayName = idt.fullName.trim();
      if (idt.address && idt.address.trim().length >= 5) updates.address = idt.address.trim();
      if (idt.phone && idt.phone.trim().length >= 7) updates.contactPhone = idt.phone.trim();
      if (idt.birthDate) {
        const d = new Date(idt.birthDate);
        if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
          updates.birthDate = d;
        }
      }
      if (Object.keys(updates).length > 0) {
        await prisma.shareholder.update({ where: { id: shareholderId }, data: updates as any });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'ai:ingest: unable to update identity from extraction');
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

  // Option: poster dans le grand livre (double-partie) via Transform + Load
  let postedEntryIds: number[] = [];
  const defaultPost = !!(env as any).POST_TO_LEDGER_DEFAULT;
  const shouldPost = typeof req.options?.postToLedger === 'boolean' ? req.options.postToLedger! : defaultPost;
  if (shouldPost && items.length > 0) {
    const { transformPersonalIncomeItemsToJournalDrafts } = await import('../etl/transform');
    const { postJournalDrafts } = await import('../etl/load');
    const drafts = transformPersonalIncomeItemsToJournalDrafts({
      userId: req.userId,
      taxYear: targetYear!,
      items
    });
    const resPost = await postJournalDrafts(drafts);
    postedEntryIds = resPost.entryIds;
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
      const name = (propertyName ?? '').toLowerCase().trim();
      const addr = (propertyAddress ?? '').toLowerCase().trim();
      let bestId: number | null = null;
      let bestScore = 0;
      for (const p of props) {
        const pn = (p.name ?? '').toLowerCase().trim();
        const pa = (p.address ?? '').toLowerCase().trim();
        // Matche exact sur adresse en priorité
        if (addr && pa && addr === pa) {
          return p.id;
        }
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

      let propertyId = bestMatchPropertyId(r?.propertyName, r?.propertyAddress);
      // Auto-création d'un immeuble si aucun match trouvé mais des infos sont disponibles
      if (!propertyId && (r?.propertyName || r?.propertyAddress)) {
        // Double-check: tentative de match strict par adresse si non déjà fait
        const addr = (r?.propertyAddress ?? '').toLowerCase().trim();
        const byExactAddress = props.find((p) => (p.address ?? '').toLowerCase().trim() === addr);
        if (byExactAddress) {
          propertyId = byExactAddress.id;
        } else {
          const nameCandidate = (r?.propertyName && String(r.propertyName).trim().length > 0)
            ? String(r.propertyName).trim()
            : (r?.propertyAddress && String(r.propertyAddress).trim().length > 0)
              ? String(r.propertyAddress).split('\n')[0].slice(0, 120)
              : `Immeuble importé ${year}`;
          const createdProp = await prisma.property.create({
            data: {
              userId: req.userId,
              name: nameCandidate,
              address: r?.propertyAddress ? String(r.propertyAddress).trim().slice(0, 500) : null
            },
            select: { id: true, name: true, address: true }
          });
          propertyId = createdProp.id;
          props.push(createdProp);
        }
      }

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

      // Auto-création (idempotente) de lignes Immeuble à partir du résumé T776/TP-128
      // Règle: on crée au plus 3 lignes agrégées par formulaire/année/immmueble
      //  - Revenu: Loyers bruts
      //  - Revenu: Autres revenus locatifs
      //  - Dépense: Dépenses totales (agrégées)
      if (propertyId) {
        const yearStart = new Date(year, 0, 1);

        // 1) Loyers bruts -> Revenue (ANNUEL)
        if (grossRents > 0) {
          const rentLabel = `${formType} ${year} – Loyers bruts`;
          const existingRent = await prisma.revenue.findFirst({
            where: {
              propertyId,
              label: rentLabel,
              startDate: yearStart
            },
            select: { id: true }
          });
          if (!existingRent) {
            await prisma.revenue.create({
              data: {
                propertyId,
                label: rentLabel,
                amount: grossRents as any,
                frequency: 'ANNUEL',
                startDate: yearStart,
                endDate: null
              }
            });
          }
        }

        // 2) Autres revenus -> Revenue (ANNUEL)
        if (otherIncome > 0) {
          const otherLabel = `${formType} ${year} – Autres revenus locatifs`;
          const existingOther = await prisma.revenue.findFirst({
            where: {
              propertyId,
              label: otherLabel,
              startDate: yearStart
            },
            select: { id: true }
          });
          if (!existingOther) {
            await prisma.revenue.create({
              data: {
                propertyId,
                label: otherLabel,
                amount: otherIncome as any,
                frequency: 'ANNUEL',
                startDate: yearStart,
                endDate: null
              }
            });
          }
        }

        // 3) Dépenses totales -> Expense (ANNUEL)
        if (totalExpenses > 0) {
          const expLabel = `${formType} ${year} – Dépenses totales (agrégées)`;
          const existingExp = await prisma.expense.findFirst({
            where: {
              propertyId,
              label: expLabel,
              startDate: yearStart
            },
            select: { id: true }
          });
          if (!existingExp) {
            await prisma.expense.create({
              data: {
                propertyId,
                label: expLabel,
                category: formType,
                amount: totalExpenses as any,
                frequency: 'ANNUEL',
                startDate: yearStart,
                endDate: null
              }
            });
          }
        }
      }
    }
  }

  // Marquage du statut d'import sur le document (historique + UI)
  const importSummary = {
    domain: 'personal-income',
    shareholderId,
    taxYear: targetYear,
    extractedCount: items.length,
    slipsCount: slips.length,
    createdCount: createdIds.length,
    duplicate: Boolean(existingDoc),
    status:
      existingDoc
        ? 'DUPLICATE'
        : items.length === 0 && slips.length === 0
          ? 'INCOMPLETE'
          : slips.length === 0
            ? 'PARTIAL'
            : 'OK'
  } as const;
  try {
    await (prisma as any).uploadedDocument.update({
      where: { id: createdDoc.id },
      data: {
        taxYear: targetYear ?? null,
        shareholderId: shareholderId ?? null,
        metadata: {
          ...(createdDoc.metadata || {}),
          import: importSummary
        } as any
      }
    });
  } catch {}

  return {
    shareholderId,
    taxYear: targetYear,
    extracted: items,
    createdIds,
    postedEntryIds,
    rentalStatements: createdRentalStatementIds,
    documentId: createdDoc.id,
    taxReturnId: taxReturn.id,
    duplicate: Boolean(existingDoc),
    status: importSummary.status
  };
}
