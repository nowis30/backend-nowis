/* eslint-disable @typescript-eslint/no-explicit-any */
import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

import { env } from '../../env';

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
  const pdfjsLib = await loadPdfJs();
  const pdfDocument = await pdfjsLib.getDocument({ data: buffer, disableWorker: true }).promise;
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

export type ExtractedPersonalIncomeItem = {
  category: string; // EMPLOYMENT | ... | OTHER
  label: string;
  amount: number;
  source?: string;
  slipType?: string;
};

export interface ExtractedPersonalTaxReturn {
  taxYear?: number;
  items: ExtractedPersonalIncomeItem[];
  confidence: number; // 0..1 overall
  rawText?: string;
}

function buildPrompt(): string {
  return [
    'Tu es un extracteur de déclarations de revenus personnelles canadiennes (T1/TP1, feuillets T4, T5, relevés).',
    'Objectif: produire une liste normalisée de revenus personnels pour alimenter un logiciel.',
    'Retourne STRICTEMENT un JSON valide conforme au schéma ci-dessous.',
    'Règles:',
    '- taxYear: année d’imposition détectée (nombre) si visible, sinon omets le champ.',
    '- items: tableau de revenus. Chaque item:',
    "  - category: une des valeurs EMPLOYMENT, PENSION, OAS, CPP_QPP, RRIF_RRSP, BUSINESS, ELIGIBLE_DIVIDEND, NON_ELIGIBLE_DIVIDEND, CAPITAL_GAIN, OTHER",
    '  - label: libellé court (ex: Salaire – Employeur ABC, Dividendes admissibles – Banque X, REER – retrait)',
    '  - amount: montant annuel CAD (nombre). Utilise le total net taxable le plus approprié.',
    '  - source: émetteur (ex: nom employeur ou institution) si connu.',
    '  - slipType: code du feuillet si connu (ex: T4, T5, RL-1, Relevé 3).',
    '- Si plusieurs feuillets du même type existent, crée un item par feuillet ou agrège si clair, mais ne duplique pas.',
    '',
    'Schéma JSON exact (ne retourne rien d’autre):',
    '{\n  "taxYear"?: number,\n  "items": {\n    "category": string,\n    "label": string,\n    "amount": number,\n    "source"?: string,\n    "slipType"?: string\n  }[],\n  "confidence": number,\n  "rawText"?: string\n}'
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
  const taxYear = typeof data?.taxYear === 'number' ? data.taxYear : undefined;
  const confidence = Math.max(0, Math.min(1, Number(data?.confidence ?? 0)));
  const rawText = typeof data?.rawText === 'string' ? data.rawText : undefined;
  return { taxYear, items, confidence, rawText };
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
  let dataUrl: string;
  if (/^application\/(pdf|x-pdf)$/i.test(contentType)) {
  dataUrl = await renderPdfFirstPageToDataUrlFromBuffer(binary);
  } else if (/^image\/(png|jpe?g|webp|heic)$/i.test(contentType)) {
    const buf = Buffer.from(binary);
    dataUrl = `data:${contentType};base64,${buf.toString('base64')}`;
  } else {
    throw new Error('Type de fichier non supporté (PDF ou image requis).');
  }

  const azure = isAzureProvider();
  const model = chooseVisionModel();
  let url: string;
  let headers: Record<string, string>;
  const body: any = {
    model,
    messages: [
      { role: 'system', content: 'Tu es un extracteur de formulaires fiscaux fiable et strict.' },
      { role: 'user', content: [{ type: 'text', text: buildPrompt() }, { type: 'image_url', image_url: { url: dataUrl } }] }
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
    headers = { 'Content-Type': 'application/json', 'api-key': env.OPENAI_API_KEY };
  } else {
    const base = normalizeOpenAIBaseUrl(env.OPENAI_BASE_URL);
    url = `${base.replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${text || res.statusText}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new Error('Réponse OpenAI vide.');
  }
  const parsed = JSON.parse(content);
  return coerceExtraction(parsed);
}
