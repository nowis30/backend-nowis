import { Router, type Request } from 'express';
import { z } from 'zod';

import { env } from '../env';
import { advisorAccess } from '../middlewares/advisorAccess';
import type { AuthenticatedRequest } from '../middlewares/authenticated';
import { evaluateAdvisors, getAdvisorQuestions } from '../services/advisors/coordinator';
import { runAvocatAdvisor } from '../services/advisors/avocat';
import { runComptableAdvisor } from '../services/advisors/comptable';
import { runFiscalisteAdvisor } from '../services/advisors/fiscaliste';
import { askGptExpert, pingOpenAI } from '../services/advisors/gptEngine';
import { nextConversationStep } from '../services/advisors/convoEngine';
import {
  listUserConversations,
  loadConversationDetail,
  persistConversationExchange,
  updateConversationStatus
} from '../services/advisors/conversationPersistence';
import { parseFacts } from '../services/advisors/parser';
import { runPlanificateurAdvisor } from '../services/advisors/planificateur';
import type {
  AdvisorAnswer,
  AdvisorContext,
  AdvisorEngineName,
  AdvisorMetric,
  AdvisorModuleOutput,
  AdvisorResponderId,
  AdvisorTargetedAnswer
} from '../services/advisors/types';

const router = Router();

const answersSchema = z
  .object({
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1),
          value: z.string().min(1)
        })
      )
      .max(32)
  })
  .strict();

const targetedQuestionSchema = z
  .object({
    expertId: z.enum(['fiscaliste', 'comptable', 'planificateur', 'avocat', 'group']),
    question: z.string().trim().min(5).max(1000),
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1),
          value: z.string().min(1)
        })
      )
      .max(32)
      .optional()
  })
  .strict();

// Endpoint de santé PUBLIC (pas d'authentification) pour diagnostiquer la connectivité OpenAI/Azure
router.get('/health', async (_req, res) => {
  try {
    const status = await pingOpenAI();
    res.json({ engine: 'gpt', openai: status });
  } catch (err) {
    res.status(500).json({ engine: 'gpt', error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/questions', advisorAccess, (_req, res) => {
  res.json({ questions: getAdvisorQuestions() });
});

function parseEngineFromRequest(req: Request): AdvisorEngineName | undefined {
  const headerValue = req.header('x-advisor-engine');
  const queryValue = typeof req.query.engine === 'string' ? req.query.engine : undefined;
  const candidate = headerValue ?? queryValue;
  if (candidate === 'gpt' || candidate === 'heuristic') {
    return candidate;
  }
  return undefined;
}

router.post('/evaluate', advisorAccess, async (req, res, next) => {
  try {
    const payload = answersSchema.parse(req.body);
    const answers = payload.answers as AdvisorAnswer[];
    const engine = parseEngineFromRequest(req);
    const result = await evaluateAdvisors(answers, { engine });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/ask', advisorAccess, async (req, res, next) => {
  try {
    const payload = targetedQuestionSchema.parse(req.body);
    const answers = (payload.answers ?? []) as AdvisorAnswer[];
    const context: AdvisorContext = {
      answers,
      parsed: parseFacts(answers)
    };

    const preferredEngine = parseEngineFromRequest(req) ?? env.ADVISOR_ENGINE;
    const gptAvailable = Boolean(env.OPENAI_API_KEY);

    if (gptAvailable && preferredEngine !== 'heuristic') {
      try {
        const gptResponse = await askGptExpert(payload.expertId, payload.question, context);
        return res.json(gptResponse);
      } catch (error) {
        // GPT indisponible : on continue avec une réponse heuristique.
        console.warn('askGptExpert failed, falling back to heuristics:', error);
      }
    }

    const fallback = buildHeuristicTargetedAnswer(payload.expertId, payload.question, context);
    res.json(fallback);
  } catch (error) {
    next(error);
  }
});

// Flux conversationnel par spécialiste
const convoSchema = z
  .object({
    conversationId: z.coerce.number().int().positive().optional(),
    expertId: z.enum(['fiscaliste', 'comptable', 'planificateur', 'avocat']),
    message: z.string().trim().min(1),
    snapshot: z
      .object({
        properties: z
          .array(
            z.object({
              id: z.number().int().optional(),
              name: z.string().min(1),
              address: z.string().optional().nullable(),
              acquisitionDate: z.string().optional().nullable(),
              currentValue: z.number().optional().nullable(),
              purchasePrice: z.number().optional().nullable(),
              notes: z.string().optional().nullable()
            })
          )
          .optional()
        ,
        personalIncomes: z
          .array(
            z.object({
              id: z.number().int().optional(),
              shareholderName: z.string().optional().nullable(),
              taxYear: z.number().int(),
              category: z.string(),
              label: z.string(),
              amount: z.number()
            })
          )
          .optional()
      })
      .default({})
  })
  .strict();

const convoListQuerySchema = z
  .object({
    expertId: z.enum(['fiscaliste', 'comptable', 'planificateur', 'avocat']).optional(),
    status: z.enum(['active', 'completed']).optional()
  })
  .optional()
  .default({});

const convoIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const convoStatusBodySchema = z.object({
  status: z.enum(['active', 'completed'])
});

router.post('/convo', advisorAccess, async (req, res, next) => {
  try {
    const { conversationId, expertId, message, snapshot } = convoSchema.parse(req.body);
    const step = await nextConversationStep(expertId, message, snapshot);

    const { userId } = req as AuthenticatedRequest;

    if (!userId) {
      res.json({ conversationId: conversationId ?? null, ...step });
      return;
    }

    const persisted = await persistConversationExchange({
      userId,
      expertId,
      message,
      snapshot,
      response: step,
      conversationId
    });

    res.json({ conversationId: persisted.conversationId, ...step });
  } catch (error) {
    next(error);
  }
});

router.get('/convo', advisorAccess, async (req, res, next) => {
  try {
    const filters = convoListQuerySchema.parse(req.query);
    const { userId } = req as AuthenticatedRequest;

    if (!userId) {
      res.json({ conversations: [] });
      return;
    }

    let conversations = await listUserConversations(userId);
    if (filters.expertId) {
      conversations = conversations.filter((item) => item.expertId === filters.expertId);
    }
    if (filters.status) {
      conversations = conversations.filter((item) => item.status === filters.status);
    }

    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.get('/convo/:id', advisorAccess, async (req, res, next) => {
  try {
    const params = convoIdParamSchema.parse(req.params);
    const { userId } = req as AuthenticatedRequest;

    if (!userId) {
      res.status(404).json({ error: 'Conversation introuvable.' });
      return;
    }

    const detail = await loadConversationDetail(userId, params.id);
    if (!detail) {
      res.status(404).json({ error: 'Conversation introuvable.' });
      return;
    }

    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.patch('/convo/:id', advisorAccess, async (req, res, next) => {
  try {
    const params = convoIdParamSchema.parse(req.params);
    const body = convoStatusBodySchema.parse(req.body);
    const { userId } = req as AuthenticatedRequest;

    if (!userId) {
      res.status(404).json({ error: 'Conversation introuvable.' });
      return;
    }

    const updated = await updateConversationStatus(userId, params.id, body.status);
    if (!updated) {
      res.status(404).json({ error: 'Conversation introuvable.' });
      return;
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// (Le endpoint /health public se trouve plus haut)

export const advisorsRouter = router;

const expertRunners: Record<AdvisorResponderId, (context: AdvisorContext) => AdvisorModuleOutput[]> = {
  fiscaliste: (context) => [runFiscalisteAdvisor(context)],
  comptable: (context) => [runComptableAdvisor(context)],
  planificateur: (context) => [runPlanificateurAdvisor(context)],
  avocat: (context) => [runAvocatAdvisor(context)],
  group: (context) => [
    runFiscalisteAdvisor(context),
    runComptableAdvisor(context),
    runPlanificateurAdvisor(context),
    runAvocatAdvisor(context)
  ]
};

const responderLabels: Record<AdvisorResponderId, string> = {
  fiscaliste: 'fiscaliste',
  comptable: 'comptable',
  planificateur: 'planificateur financier',
  avocat: 'avocat corporatif',
  group: 'comite IA'
};

function dedupeMetrics(metrics: AdvisorMetric[]): AdvisorMetric[] {
  const map = new Map<string, AdvisorMetric>();
  for (const metric of metrics) {
    const current = map.get(metric.id);
    if (!current) {
      map.set(metric.id, { ...metric, expertIds: [...metric.expertIds] });
      continue;
    }

    map.set(metric.id, {
      ...current,
      value: metric.value,
      explanation: metric.explanation,
      expertIds: Array.from(new Set([...current.expertIds, ...metric.expertIds]))
    });
  }
  return Array.from(map.values());
}

function buildHeuristicTargetedAnswer(
  responder: AdvisorResponderId,
  question: string,
  context: AdvisorContext
): AdvisorTargetedAnswer {
  const outputs = expertRunners[responder](context);
  const trimmedQuestion = question.trim();

  if (responder === 'group') {
    const summaries = outputs
      .map((output) => output.recommendation.summary || output.recommendation.title)
      .filter((value): value is string => Boolean(value));
  const intro = trimmedQuestion.length > 0 ? `En lien avec "${trimmedQuestion}", ` : '';
    const answerBody = summaries.length
      ? summaries.join(' | ')
      : "le comite IA n'a pas encore suffisamment de donnees pour repondre precisement.";
    const rationales = outputs.flatMap((output) => output.recommendation.rationale);
    const followUps = Array.from(
      new Set(outputs.flatMap((output) => output.followUps))
    );
    const metrics = dedupeMetrics(outputs.flatMap((output) => output.metrics));

    return {
      expertId: 'group',
      answer: `${intro}${answerBody}`,
      keyPoints: rationales,
      followUps,
      metrics,
      engine: {
        mode: 'heuristic',
  note: 'Réponse heuristique du comite IA.'
      }
    };
  }

  const output = outputs[0];
  const summary = output.recommendation.summary || output.recommendation.title;
  const intro = trimmedQuestion.length > 0 ? `En lien avec "${trimmedQuestion}", ` : '';
  return {
    expertId: responder,
    answer: `${intro}${summary}`,
    keyPoints: output.recommendation.rationale,
    followUps: output.followUps,
    metrics: output.metrics.map((metric) => ({ ...metric, expertIds: [...metric.expertIds] })),
    engine: {
      mode: 'heuristic',
      note: `Réponse heuristique du ${responderLabels[responder]}.`
    }
  };
}
