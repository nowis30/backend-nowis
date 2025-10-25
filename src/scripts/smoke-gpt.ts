import 'dotenv/config';

import { env } from '../server/env';
import { evaluateAdvisors } from '../server/services/advisors/coordinator';
import type { AdvisorAnswer } from '../server/services/advisors/types';

async function main() {
  const answers: AdvisorAnswer[] = [
    { questionId: 'taxableIncome', value: '350000' },
    { questionId: 'profitMargin', value: '28' },
    { questionId: 'province', value: 'QC' },
    { questionId: 'holdingStructure', value: 'YES' },
    { questionId: 'dividendIntent', value: 'LOW' },
    { questionId: 'liquidityGoal', value: 'GROWTH' },
    { questionId: 'legalConcern', value: 'NONE' }
  ];

  const engine = 'gpt' as const;

  if (!env.OPENAI_API_KEY) {
    console.warn('[smoke-gpt] OPENAI_API_KEY manquant — test GPT ignoré, on vérifie juste la voie heuristique.');
    const heuristic = await evaluateAdvisors(answers, { engine: 'heuristic' });
    console.log('[smoke-gpt] Heuristic OK:', {
      completed: heuristic.completed,
      recs: heuristic.recommendations.length,
      metrics: heuristic.metrics.length
    });
    return;
  }

  const result = await evaluateAdvisors(answers, { engine });
  console.log('[smoke-gpt] GPT OK:', {
    engine: result.engine,
    completed: result.completed,
    recs: result.recommendations.length,
    metrics: result.metrics.length,
    summary: result.coordinatorSummary?.slice(0, 120)
  });
}

main().catch((err) => {
  console.error('[smoke-gpt] Échec:', err?.message || err);
  process.exit(1);
});
