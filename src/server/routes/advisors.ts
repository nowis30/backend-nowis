import { Router, type Request } from 'express';
import { z } from 'zod';

import { advisorAccess } from '../middlewares/advisorAccess';
import { evaluateAdvisors, getAdvisorQuestions } from '../services/advisors/coordinator';
import { pingOpenAI } from '../services/advisors/gptEngine';
import type { AdvisorAnswer, AdvisorEngineName } from '../services/advisors/types';

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

// (Le endpoint /health public se trouve plus haut)

export const advisorsRouter = router;
