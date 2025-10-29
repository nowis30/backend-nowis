/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

import { env } from '../../env';
import { logger } from '../../lib/logger';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsLibPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>;
  }
  return pdfjsLibPromise;
}

interface CanvasAndContext {
  canvas: Canvas;
  context: SKRSContext2D;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width || 1, height || 1);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = width || 1;
    canvasAndContext.canvas.height = height || 1;
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    // @ts-expect-error release
    canvasAndContext.canvas = null;
    // @ts-expect-error release
    canvasAndContext.context = null;
  }
}

function normalizeTextForDedup(input: any): string {
  try {
    const s = String(input ?? '')
      .normalize('NFD') // décompose accents
      .replace(/[\u0300-\u036f]/g, '') // enlève diacritiques
      .toLowerCase()
      // remplace toute ponctuation et séparateurs par un espace
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ') // compresse espaces
      .trim();
    return s;
  } catch {
    return String(input ?? '').trim().toLowerCase();
  }
}

function isAzureProvider(): boolean {
  if (env.OPENAI_PROVIDER === 'azure') return true;
  const base = env.OPENAI_BASE_URL || '';
  return /\.openai\.azure\.com/i.test(base);
}

function normalizeOpenAIBaseUrl(base: string | undefined): string {
  const trimmed = (base || 'https://api.openai.com/v1').replace(/\/$/, '');
  if (/^https:\/\/api\.openai\.com$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

function chooseVisionModel(): string {
  return env.OPENAI_MODEL_VISION || env.OPENAI_MODEL_TARGETED || env.OPENAI_MODEL || 'gpt-4o-mini';
}

async function renderPdfFirstPageToDataUrlFromBuffer(buffer: Uint8Array): Promise<string> {
  // Diagnostic: vérifier les types en prod
  // @ts-ignore Buffer may be undefined in some runtimes
  const seenAsBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(buffer as any);
  logger.info(
    {
      where: 'renderPdfFirstPageToDataUrlFromBuffer',
      seenAsBuffer,
      constructor: (buffer as any)?.constructor?.name,
      byteLength: buffer?.byteLength
    },
    'ai:pdf: start render first page'
  );
  const pdfjsLib = await loadPdfJs();
  // Crée une copie ArrayBuffer détachée pour éviter tout aliasing de mémoire avec Buffer
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const pure = new Uint8Array(ab);
  // Fournit l'URL des polices standard pour éviter les warnings en prod
  // Préfère les polices locales (node_modules) pour éviter les échecs réseau en prod
  let standardFontDataUrl: string;
  try {
    // Résout le dossier standard_fonts dans pdfjs-dist
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const dir = path.join(path.dirname(pkgPath), 'standard_fonts') + '/';
    standardFontDataUrl = dir.replace(/\\/g, '/');
  } catch {
    const version = (pdfjsLib as any)?.version || 'latest';
    standardFontDataUrl = `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`;
  }
  const pdfDocument = await pdfjsLib
    .getDocument({ data: pure, disableWorker: true, standardFontDataUrl })
    .promise;
  if (pdfDocument.numPages < 1) {
    throw new Error('PDF vide: aucune page à analyser.');
  }
  const page = await pdfDocument.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvasFactory = new NodeCanvasFactory();
  const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

  const renderContext = {
    canvasContext: context,
    viewport,
    canvasFactory
  };

  await page.render(renderContext).promise;
  const pngBuffer = canvas.toBuffer('image/png');
  canvasFactory.destroy({ canvas, context });
  pdfDocument.cleanup();
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

async function renderPdfPagesToDataUrlsFromBuffer(
  buffer: Uint8Array,
  opts?: { maxPages?: number; scale?: number }
): Promise<string[]> {
  // maxPages: nombre de pages à rendre; si <=0 ou si AI_PDF_MAX_PAGES = ALL/*, on lit TOUTES les pages.
  const envMax = process.env.AI_PDF_MAX_PAGES;
  let maxPages: number | null = null;
  if (typeof opts?.maxPages === 'number' && Number.isFinite(opts.maxPages)) {
    maxPages = opts.maxPages;
  } else if (typeof envMax === 'string' && envMax.trim() !== '') {
    if (/^(all|\*)$/i.test(envMax.trim())) {
      maxPages = 0; // 0 => toutes
    } else {
      const n = parseInt(envMax.trim(), 10);
      maxPages = Number.isFinite(n) ? n : null;
    }
  }
  if (maxPages == null) maxPages = 5; // défaut
  const scale = opts?.scale ?? 1.8;

  const pdfjsLib = await loadPdfJs();
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const pure = new Uint8Array(ab);
  let standardFontDataUrl: string;
  try {
    const pkgPath = require.resolve('pdfjs-dist/package.json');
    const dir = path.join(path.dirname(pkgPath), 'standard_fonts') + '/';
    standardFontDataUrl = dir.replace(/\\/g, '/');
  } catch {
    const version = (pdfjsLib as any)?.version || 'latest';
    standardFontDataUrl = `https://unpkg.com/pdfjs-dist@${version}/standard_fonts/`;
  }
  const pdfDocument = await pdfjsLib
    .getDocument({ data: pure, disableWorker: true, standardFontDataUrl })
    .promise;
  const pageCount = maxPages <= 0 ? pdfDocument.numPages : Math.min(pdfDocument.numPages, Math.max(1, maxPages));
  const canvasFactory = new NodeCanvasFactory();
  const images: string[] = [];
  try {
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdfDocument.getPage(p);
      const viewport = page.getViewport({ scale });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);
      const renderContext = { canvasContext: context, viewport, canvasFactory } as any;
      await page.render(renderContext).promise;
      const pngBuffer = canvas.toBuffer('image/png');
      images.push(`data:image/png;base64,${pngBuffer.toString('base64')}`);
      canvasFactory.destroy({ canvas, context });
    }
  } finally {
    pdfDocument.cleanup();
  }
  return images;
}

export type ExtractedPersonalIncomeItem = {
  category: string; // EMPLOYMENT | ... | OTHER
  label: string;
  amount: number;
  source?: string;
  slipType?: string;
};

export type ExtractedSlipLine = {
  code?: string;
  label: string;
  amount: number;
};

export type ExtractedTaxSlip = {
  slipType: string; // ex: T4, T5, RL-1, T3, T5008, T4A
  issuer?: string;
  accountNumber?: string;
  lines: ExtractedSlipLine[];
};

export interface ExtractedPersonalTaxReturn {
  taxYear?: number;
  items: ExtractedPersonalIncomeItem[];
  slips?: ExtractedTaxSlip[];
  confidence: number; // 0..1 overall
  rawText?: string;
  identity?: {
    fullName?: string;
    address?: string;
    birthDate?: string; // ISO or recognizable date string
    phone?: string;
    sin?: string; // if visible, mask except last 3 if possible
  };
}

function buildPrompt(): string {
  return [
    'Tu es un extracteur de déclarations de revenus personnelles canadiennes (T1/TP1, feuillets T4, T5, relevés).',
    "Objectif: produire une liste normalisée de revenus personnels ET, lorsque possible, les FEUILLETS (slips) avec leurs lignes (numéros de case/code et montants).",
    'Inclure aussi les MÉTADONNÉES D\'IDENTITÉ si visibles (nom complet, adresse postale, date de naissance, téléphone, NAS).',
    'Retourne STRICTEMENT un JSON valide conforme au schéma ci-dessous.',
    'Règles:',
    '- taxYear: année d’imposition détectée (nombre) si visible, sinon omets le champ.',
    '- items: tableau de revenus (agrégé). Chaque item:',
    "  - category: une des valeurs EMPLOYMENT, PENSION, OAS, CPP_QPP, RRIF_RRSP, BUSINESS, ELIGIBLE_DIVIDEND, NON_ELIGIBLE_DIVIDEND, CAPITAL_GAIN, OTHER",
    '  - label: libellé court (ex: Salaire – Employeur ABC, Dividendes admissibles – Banque X, REER – retrait)',
    '  - amount: montant annuel CAD (nombre). Utilise le total net taxable le plus approprié.',
    '  - source: émetteur (ex: nom employeur ou institution) si connu.',
    '  - slipType: code du feuillet si connu (ex: T4, T5, RL-1, Relevé 3).',
    '- Si plusieurs feuillets du même type existent, crée un item par feuillet ou agrège si clair, mais ne duplique pas.',
    '',
    '- slips: tableau détaillé des feuillets détectés, si possible. Chaque slip:',
    '  - slipType: ex: T4, T5, RL-1, T3, T5008, T4A',
    '  - issuer: nom de l’émetteur si visible',
    '  - accountNumber: numéro de compte si visible',
    '  - lines: tableau des lignes du feuillet (utilise le numéro/case quand présent):',
    '    - code: code/numéro de ligne/case (ex: 14 pour T4 case 14, ou RL-1 A, etc.)',
    '    - label: libellé court de la ligne',
    '    - amount: montant numérique',
    '',
    '- identity: métadonnées s\'il y a lieu (NE DEVINE PAS):',
    '  - fullName: nom et prénom tels qu\'affichés',
    '  - address: adresse postale complète en une ligne',
    '  - birthDate: date de naissance (format ISO recommandé 1990-05-12, sinon la chaîne trouvée)',
    '  - phone: numéro de téléphone normalisé si visible',
    '  - sin: NAS. Si complet, MASQUE les 6 premiers chiffres avec des x (ex: xxx-xxx-123). Si partiel, renvoie tel quel.',
    '',
    'Schéma JSON exact (ne retourne rien d’autre):',
    '{\n  "taxYear"?: number,\n  "items": {\n    "category": string,\n    "label": string,\n    "amount": number,\n    "source"?: string,\n    "slipType"?: string\n  }[],\n  "slips"?: {\n    "slipType": string,\n    "issuer"?: string,\n    "accountNumber"?: string,\n    "lines": {\n      "code"?: string,\n      "label": string,\n      "amount": number\n    }[]\n  }[],\n  "confidence": number,\n  "rawText"?: string,\n  "identity"?: {\n    "fullName"?: string,\n    "address"?: string,\n    "birthDate"?: string,\n    "phone"?: string,\n    "sin"?: string\n  }\n}'
  ].join('\n');
}

function coerceExtraction(data: any): ExtractedPersonalTaxReturn {
  const items: ExtractedPersonalIncomeItem[] = Array.isArray(data?.items)
    ? data.items
        .filter((x: any) => x && typeof x.label === 'string' && typeof x.amount !== 'undefined')
        .map((x: any) => ({
          category: typeof x.category === 'string' ? x.category : 'OTHER',
          label: String(x.label).trim(),
          amount: Number(x.amount ?? 0),
          source: typeof x.source === 'string' ? x.source : undefined,
          slipType: typeof x.slipType === 'string' ? x.slipType : undefined
        }))
    : [];
  const slips: ExtractedTaxSlip[] = Array.isArray(data?.slips)
    ? data.slips
        .filter((s: any) => s && typeof s.slipType === 'string')
        .map((s: any) => ({
          slipType: String(s.slipType).trim(),
          issuer: typeof s.issuer === 'string' ? s.issuer : undefined,
          accountNumber: typeof s.accountNumber === 'string' ? s.accountNumber : undefined,
          lines: Array.isArray(s.lines)
            ? s.lines
                .filter((li: any) => li && typeof li.label === 'string' && typeof li.amount !== 'undefined')
                .map((li: any) => ({
                  code: typeof li.code === 'string' ? li.code : undefined,
                  label: String(li.label).trim(),
                  amount: Number(li.amount ?? 0)
                }))
            : []
        }))
    : [];
  const taxYear = typeof data?.taxYear === 'number' ? data.taxYear : undefined;
  const confidence = Math.max(0, Math.min(1, Number(data?.confidence ?? 0)));
  const rawText = typeof data?.rawText === 'string' ? data.rawText : undefined;
  let identity: ExtractedPersonalTaxReturn['identity'] | undefined = undefined;
  if (data?.identity && typeof data.identity === 'object') {
    identity = {
      fullName: typeof data.identity.fullName === 'string' ? data.identity.fullName.trim() : undefined,
      address: typeof data.identity.address === 'string' ? data.identity.address.trim() : undefined,
      birthDate: typeof data.identity.birthDate === 'string' ? data.identity.birthDate.trim() : undefined,
      phone: typeof data.identity.phone === 'string' ? data.identity.phone.trim() : undefined,
      sin: typeof data.identity.sin === 'string' ? data.identity.sin.trim() : undefined
    };
  }
  return { taxYear, items, slips, confidence, rawText, identity };
}

export async function extractPersonalTaxReturn(params: {
  buffer: Uint8Array | Buffer;
  contentType: string;
}): Promise<ExtractedPersonalTaxReturn> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquant: configurez une clé API pour l'extraction.");
  }

  const { contentType } = params;
  // Normalise en Uint8Array (attention: Buffer hérite de Uint8Array donc il faut le détecter explicitement)
  let binary: Uint8Array;
  // @ts-ignore Buffer global peut ne pas exister selon l'environnement
  const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(params.buffer as any);
  if (isBuffer) {
    // Copie vers un Uint8Array pur
    // @ts-ignore Buffer typings
    binary = new Uint8Array(params.buffer as any);
  } else if (params.buffer instanceof Uint8Array) {
    binary = params.buffer as Uint8Array;
  } else {
    // Dernier recours
    // @ts-ignore any to Uint8Array
    binary = new Uint8Array(params.buffer as any);
  }
  logger.info(
    {
      where: 'extractPersonalTaxReturn',
      contentType,
      receivedType: (params.buffer as any)?.constructor?.name,
      wasBuffer: isBuffer,
      byteLength: isBuffer ? (params.buffer as any)?.length : (params.buffer as any)?.byteLength
    },
    'ai:ingest: input binary normalized'
  );
  let dataUrls: string[];
  if (/^application\/(pdf|x-pdf)$/i.test(contentType)) {
    try {
      dataUrls = await renderPdfPagesToDataUrlsFromBuffer(binary, { maxPages: Number(process.env.AI_PDF_MAX_PAGES || 5) });
    } catch (e) {
      logger.error({ err: e }, 'ai:pdf: failed to render pages');
      throw e;
    }
  } else if (/^image\/(png|jpe?g|webp|heic)$/i.test(contentType)) {
    const buf = Buffer.from(binary);
    dataUrls = [`data:${contentType};base64,${buf.toString('base64')}`];
  } else {
    throw new Error('Type de fichier non supporté (PDF ou image requis).');
  }

  const azure = isAzureProvider();
  const model = chooseVisionModel();
  let url: string;
  let headers: Record<string, string>;
  if (azure) {
    const base = env.OPENAI_BASE_URL || '';
    const deployment = env.OPENAI_AZURE_DEPLOYMENT;
    const apiVersion = env.OPENAI_API_VERSION || '2024-02-15-preview';
    if (!deployment) {
      throw new Error('OPENAI_AZURE_DEPLOYMENT manquant pour Azure OpenAI.');
    }
    url = `${base.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    headers = { 'Content-Type': 'application/json', 'api-key': env.OPENAI_API_KEY };
  } else {
    const base = normalizeOpenAIBaseUrl(env.OPENAI_BASE_URL);
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  }

  const batchSize = Math.max(1, Number(process.env.AI_PDF_BATCH_PAGES || 5));
  const batches: string[][] = [];
  for (let i = 0; i < dataUrls.length; i += batchSize) {
    batches.push(dataUrls.slice(i, i + batchSize));
  }

  let aggregated: ExtractedPersonalTaxReturn = { taxYear: undefined, items: [], slips: [], confidence: 0 };
  for (const pages of batches) {
    const body: any = {
      model,
      messages: [
        { role: 'system', content: 'Tu es un extracteur de formulaires fiscaux fiable et strict.' },
        { role: 'user', content: [{ type: 'text', text: buildPrompt() }, ...pages.map((u) => ({ type: 'image_url', image_url: { url: u } }))] }
      ],
      temperature: 1,
      response_format: { type: 'json_object' }
    };

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content) continue;
    const parsed = coerceExtraction(JSON.parse(content));
    // Agrégation simple
    if (!aggregated.taxYear && parsed.taxYear) aggregated.taxYear = parsed.taxYear;
    aggregated.items.push(...(parsed.items || []));
    if (parsed.slips && parsed.slips.length) {
      aggregated.slips = [...(aggregated.slips || []), ...parsed.slips];
    }
    aggregated.confidence = Math.max(aggregated.confidence || 0, parsed.confidence || 0);
    // Conserver rawText du premier batch contenant du texte
    if (!aggregated.rawText && parsed.rawText) aggregated.rawText = parsed.rawText;
  }
  // Déduplication renforcée des items et feuillets entre lots
  const norm = (v: any) => normalizeTextForDedup(v);
  // Items: clé = category|label(norm)|source(norm)|slipType(norm)|amount(2d)
  if (aggregated.items?.length) {
    const seen = new Set<string>();
    aggregated.items = aggregated.items.filter((i: ExtractedPersonalIncomeItem) => {
      const amt = Number.isFinite(i.amount) ? (Math.round(i.amount * 100) / 100).toFixed(2) : '0.00';
      const key = `${norm(i.category)}|${norm(i.label)}|${norm(i.source)}|${norm(i.slipType)}|${amt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  // Dédupliquer les lignes à l'intérieur de chaque feuillet
  if (aggregated.slips?.length) {
    aggregated.slips = (aggregated.slips || []).map((s) => {
      if (!s?.lines?.length) return s;
      const seenLines = new Set<string>();
      const lines = s.lines.filter((li) => {
        const amt = Number.isFinite(li.amount) ? (Math.round(li.amount * 100) / 100).toFixed(2) : '0.00';
        const lineKey = `${norm(li.code)}|${norm(li.label)}|${amt}`;
        if (seenLines.has(lineKey)) return false;
        seenLines.add(lineKey);
        return true;
      });
      return { ...s, lines };
    });
    // Dédupliquer les feuillets entre eux avec une clé robuste incluant les lignes (codes/labels triés)
    const seenSlips = new Set<string>();
    aggregated.slips = aggregated.slips.filter((s) => {
      const baseKey = `${norm(s.slipType)}|${norm(s.issuer)}|${norm(s.accountNumber)}|${s ? (aggregated.taxYear ?? '') : ''}`;
      const lineSig = (s.lines || [])
        .map((li) => `${norm(li.code)}:${norm(li.label)}:${Number.isFinite(li.amount) ? (Math.round(li.amount * 100) / 100).toFixed(2) : '0.00'}`)
        .sort()
        .join(';');
      const key = `${baseKey}|${lineSig}`;
      if (seenSlips.has(key)) return false;
      seenSlips.add(key);
      return true;
    });
  }
  return aggregated;
}

export type ExtractedRentalSummary = {
  formType?: 'T776' | 'TP128' | 'UNKNOWN';
  taxYear?: number;
  propertyAddress?: string;
  propertyName?: string;
  grossRents?: number;
  otherIncome?: number;
  totalExpenses?: number;
  netIncome?: number;
};

function buildRentalPrompt(): string {
  return [
    'Si le document contient un formulaire de revenus locatifs (T776 fédéral ou TP-128 Québec), extrait un résumé minimal.',
    'Retourne STRICTEMENT un JSON valide avec un tableau rentals. Si aucune info locative claire, retourne rentals: [].',
    'Pour chaque immeuble/formulaire identifié, inclure: formType (T776|TP128|UNKNOWN), taxYear, propertyAddress, propertyName,',
    'grossRents (nombre), otherIncome (nombre si connu, sinon 0), totalExpenses (nombre si connu), netIncome (nombre si connu).',
    '',
    'Schéma JSON attendu (rien d’autre):',
    '{\n  "rentals": {\n    "formType"?: "T776"|"TP128"|"UNKNOWN",\n    "taxYear"?: number,\n    "propertyAddress"?: string,\n    "propertyName"?: string,\n    "grossRents"?: number,\n    "otherIncome"?: number,\n    "totalExpenses"?: number,\n    "netIncome"?: number\n  }[]\n}'
  ].join('\n');
}

export async function extractRentalTaxSummaries(params: {
  buffer: Uint8Array | Buffer;
  contentType: string;
}): Promise<ExtractedRentalSummary[]> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquant: configurez une clé API pour l'extraction.");
  }

  const { contentType } = params;
  let binary: Uint8Array;
  // @ts-ignore
  const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(params.buffer as any);
  if (isBuffer) {
    // @ts-ignore
    binary = new Uint8Array(params.buffer as any);
  } else if (params.buffer instanceof Uint8Array) {
    binary = params.buffer as Uint8Array;
  } else {
    // @ts-ignore
    binary = new Uint8Array(params.buffer as any);
  }

  let dataUrls: string[];
  if (/^application\/(pdf|x-pdf)$/i.test(contentType)) {
    dataUrls = await renderPdfPagesToDataUrlsFromBuffer(binary, { maxPages: Number(process.env.AI_PDF_MAX_PAGES || 5) });
  } else if (/^image\/(png|jpe?g|webp|heic)$/i.test(contentType)) {
    const buf = Buffer.from(binary);
    dataUrls = [`data:${contentType};base64,${buf.toString('base64')}`];
  } else {
    return [];
  }

  const azure = isAzureProvider();
  const model = chooseVisionModel();
  let url: string;
  let headers: Record<string, string>;
  if (azure) {
    const base = env.OPENAI_BASE_URL || '';
    const deployment = env.OPENAI_AZURE_DEPLOYMENT;
    const apiVersion = env.OPENAI_API_VERSION || '2024-02-15-preview';
    if (!deployment) {
      throw new Error('OPENAI_AZURE_DEPLOYMENT manquant pour Azure OpenAI.');
    }
    url = `${base.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    headers = { 'Content-Type': 'application/json', 'api-key': env.OPENAI_API_KEY };
  } else {
    const base = normalizeOpenAIBaseUrl(env.OPENAI_BASE_URL);
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  }

  const batchSize = Math.max(1, Number(process.env.AI_PDF_BATCH_PAGES || 5));
  const batches: string[][] = [];
  for (let i = 0; i < dataUrls.length; i += batchSize) {
    batches.push(dataUrls.slice(i, i + batchSize));
  }
  const all: ExtractedRentalSummary[] = [];
  for (const pages of batches) {
    const body: any = {
      model,
      messages: [
        { role: 'system', content: 'Tu es un extracteur fiable et concis.' },
        { role: 'user', content: [{ type: 'text', text: buildRentalPrompt() }, ...pages.map((u) => ({ type: 'image_url', image_url: { url: u } }))] }
      ],
      temperature: 1,
      response_format: { type: 'json_object' }
    };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn({ status: res.status, text }, 'extractRentalTaxSummaries: OpenAI non-ok');
      continue;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? '';
    if (!content) continue;
    try {
      const parsed = JSON.parse(content) as { rentals?: ExtractedRentalSummary[] };
      if (Array.isArray(parsed?.rentals)) all.push(...parsed.rentals);
    } catch {
      // ignore batch parse error
    }
  }
  return all;
}
