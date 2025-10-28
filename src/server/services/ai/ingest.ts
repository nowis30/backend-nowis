/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '../../lib/prisma';
import { env } from '../../env';
import { extractPersonalTaxReturn } from '../../services/tax';

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

async function ingestPersonalIncome(req: IngestRequest): Promise<any> {
  if (!hasOpenAiKey()) {
    throw Object.assign(
      new Error(
        "Extraction indisponible: configurez OPENAI_API_KEY (ou Azure équivalent) pour activer l'import IA."
      ),
      { status: 501 }
    );
  }

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
    amount: Number(it.amount || 0),
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
  if (req.options?.autoCreate) {
    for (const item of items) {
      if (!(item.label && item.amount > 0)) continue;
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

  return {
    shareholderId,
    taxYear: targetYear,
    extracted: items,
    createdIds
  };
}
