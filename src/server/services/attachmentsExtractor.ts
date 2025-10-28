/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

import { env } from '../env';
import { resolveAttachmentPath } from './attachmentStorage';

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
    if (!canvasAndContext.canvas) {
      return;
    }
    canvasAndContext.canvas.width = width || 1;
    canvasAndContext.canvas.height = height || 1;
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    // @ts-expect-error: release references for GC
    canvasAndContext.canvas = null;
    // @ts-expect-error: release references for GC
    canvasAndContext.context = null;
  }
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsLibPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>;
  }
  return pdfjsLibPromise;
}

async function renderPdfFirstPageToDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  // pdfjs attend un Uint8Array pur, pas un Buffer Node
  const typed = Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : (buffer as unknown as Uint8Array);
  const pdfjsLib = await loadPdfJs();
  const pdfDocument = await pdfjsLib.getDocument({ data: typed, disableWorker: true }).promise;
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

function isAzureProvider(): boolean {
  if (env.OPENAI_PROVIDER === 'azure') return true;
  const base = env.OPENAI_BASE_URL || '';
  return /\.openai\.azure\.com/i.test(base);
}

function normalizeOpenAIBaseUrl(base: string): string {
  const trimmed = base.replace(/\/$/, '');
  if (/^https:\/\/api\.openai\.com$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return base;
}

function chooseVisionModel(): string {
  return env.OPENAI_MODEL_VISION || env.OPENAI_MODEL_TARGETED || env.OPENAI_MODEL || 'gpt-4o-mini';
}

export interface ExtractedExpense {
  label: string;
  category: string;
  amount: number;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  confidence: number; // 0..1
  rawText?: string;
}

function buildPrompt(): string {
  return [
    'Tu extrais des champs pour une dépense à partir d’un reçu scanné.',
    'Retourne STRICTEMENT un JSON valide selon le schéma demandé.',
    'Règles:',
    '- label: nom du commerçant + type d’achat court (ex: "RONA – Matériaux"),',
    "- category: une courte catégorie (ex: 'Entretien', 'Matériaux', 'Frais bancaires', 'Taxes', 'Assurances', 'Services publics', 'Autre'),",
    '- amount: total TTC (nombre décimal).',
    '- startDate: la date du reçu au format YYYY-MM-DD (utilise la date la plus évidente du reçu).',
    '- endDate: null (reçus ponctuels).',
    '- confidence: entre 0 et 1 selon la lisibilité.',
    '- rawText: texte OCR libre (optionnel).',
    '',
    'Schéma JSON attendu (rien d’autre) :',
    '{\n  "label": string,\n  "category": string,\n  "amount": number,\n  "startDate": string,\n  "endDate": null,\n  "confidence": number,\n  "rawText"?: string\n}'
  ].join('\n');
}

function coerceResult(data: any): ExtractedExpense {
  const label = typeof data?.label === 'string' ? data.label.trim() : '';
  const category = typeof data?.category === 'string' ? data.category.trim() : 'Autre';
  const amount = Number(data?.amount ?? 0);
  const startDate = typeof data?.startDate === 'string' ? data.startDate : '';
  const endDate = data?.endDate == null ? null : (String(data.endDate) || null);
  const confidence = Math.max(0, Math.min(1, Number(data?.confidence ?? 0)));
  const rawText = typeof data?.rawText === 'string' ? data.rawText : undefined;

  return { label, category: category || 'Autre', amount, startDate, endDate, confidence, rawText };
}

export async function extractExpenseFromAttachment(storagePath: string, contentType: string): Promise<ExtractedExpense> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY manquant: configurez une clé API pour activer l\'extraction.');
  }

  const absPath = resolveAttachmentPath(storagePath);
  let dataUrl: string;

  if (/^application\/(pdf|x-pdf)$/i.test(contentType)) {
    dataUrl = await renderPdfFirstPageToDataUrl(absPath);
  } else if (/^image\/(png|jpe?g|webp|heic)$/i.test(contentType)) {
    const buffer = await fs.promises.readFile(absPath);
    dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
  } else {
    throw new Error('Type de fichier non supporté pour extraction (images ou PDF).');
  }

  const azure = isAzureProvider();
  const model = chooseVisionModel();
  let url: string;
  let headers: Record<string, string>;
  const body: any = {
    model,
    messages: [
      { role: 'system', content: 'Tu es un extracteur très fiable et strict.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildPrompt() },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  };

  if (azure) {
    const base = env.OPENAI_BASE_URL || '';
    const deployment = env.OPENAI_AZURE_DEPLOYMENT;
    const apiVersion = env.OPENAI_API_VERSION || '2024-02-15-preview';
    if (!deployment) {
      throw new Error('OPENAI_AZURE_DEPLOYMENT manquant pour Azure OpenAI.');
    }
    url = `${base.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    headers = {
      'Content-Type': 'application/json',
      'api-key': env.OPENAI_API_KEY
    };
  } else {
    const base = normalizeOpenAIBaseUrl(env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('Réponse OpenAI vide.');
  }

  // OpenAI renvoie un JSON (en string)
  const parsed = JSON.parse(content);
  return coerceResult(parsed);
}
