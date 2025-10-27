import { env } from '../../env';
import { describeUncertainFacts, determineNextQuestion, listAdvisorQuestions, parseFacts } from './parser';
import { runAvocatAdvisor } from './avocat';
import { runComptableAdvisor } from './comptable';
import { runFiscalisteAdvisor } from './fiscaliste';
import { runPlanificateurAdvisor } from './planificateur';
import { buildGptCore } from './gptEngine';
import {
  AdvisorAnswer,
  AdvisorContext,
  AdvisorEngineName,
  AdvisorMetric,
  AdvisorModuleOutput,
  AdvisorResult,
  EvaluateAdvisorsOptions
} from './types';

function deduplicateMetrics(outputs: AdvisorModuleOutput[]): AdvisorMetric[] {
  const merged = new Map<string, AdvisorMetric>();

  for (const output of outputs) {
    for (const metric of output.metrics) {
      const current = merged.get(metric.id);
      if (!current) {
        merged.set(metric.id, { ...metric, expertIds: [...metric.expertIds] });
      } else {
        merged.set(metric.id, {
          ...current,
          value: metric.value,
          explanation: metric.explanation,
          expertIds: Array.from(new Set([...current.expertIds, ...metric.expertIds]))
        });
      }
    }
  }

  return Array.from(merged.values());
}

function aggregateFollowUps(outputs: AdvisorModuleOutput[]): string[] {
  const set = new Set<string>();
  outputs.forEach((output) => output.followUps.forEach((item) => set.add(item)));
  return Array.from(set);
}

function computeCoordinatorSummary(outputs: AdvisorModuleOutput[]): string {
  const fiscal = outputs.find((output) => output.recommendation.expertId === 'fiscaliste');
  const comptable = outputs.find((output) => output.recommendation.expertId === 'comptable');
  const planificateur = outputs.find((output) => output.recommendation.expertId === 'planificateur');
  const avocat = outputs.find((output) => output.recommendation.expertId === 'avocat');

  const highlights: string[] = [];

  if (fiscal?.recommendation.summary) {
    highlights.push(fiscal.recommendation.summary);
  }
  if (comptable?.recommendation.summary) {
    highlights.push(comptable.recommendation.summary);
  }
  if (planificateur?.recommendation.summary) {
    highlights.push(planificateur.recommendation.summary);
  }
  if (avocat?.recommendation.summary) {
    highlights.push(avocat.recommendation.summary);
  }

  if (highlights.length === 0) {
    return "Aucune recommandation spécifique pour le moment. Répondez aux questions pour obtenir un diagnostic.";
  }

  return highlights.join(' | ');
}

type AdvisorResultCore = Omit<AdvisorResult, 'engine'>;

function buildHeuristicCore(answers: AdvisorAnswer[]): AdvisorResultCore {
  const nextQuestion = determineNextQuestion(answers);
  const completed = !nextQuestion;

  const context: AdvisorContext = {
    answers,
    parsed: parseFacts(answers)
  };

  const uncertainty = describeUncertainFacts(answers, context.parsed.uncertain);

  const modules = completed
    ? [runFiscalisteAdvisor, runComptableAdvisor, runPlanificateurAdvisor, runAvocatAdvisor]
    : [];

  const outputs = modules.map((runner) => runner(context));

  const metrics = completed ? deduplicateMetrics(outputs) : [];
  const followUps = completed ? aggregateFollowUps(outputs) : [];
  const coordinatorSummary = completed ? computeCoordinatorSummary(outputs) : '';

  return {
    nextQuestion,
    completed,
    coordinatorSummary,
    recommendations: outputs.map((output) => output.recommendation),
    metrics,
    followUps,
    uncertainty
  };
}

function attachEngine(
  core: AdvisorResultCore,
  engine: AdvisorEngineName,
  isSimulated: boolean,
  note?: string
): AdvisorResult {
  return {
    ...core,
    engine: {
      mode: engine,
      isSimulated,
      note
    }
  };
}

export async function evaluateAdvisors(
  answers: AdvisorAnswer[],
  options: EvaluateAdvisorsOptions = {}
): Promise<AdvisorResult> {
  const requestedEngine: AdvisorEngineName = options.engine ?? env.ADVISOR_ENGINE;

  if (requestedEngine === 'gpt') {
    // Utiliser GPT uniquement lorsque le questionnaire est complété; sinon, retourner la prochaine question.
    const nextQuestion = determineNextQuestion(answers);
    if (nextQuestion) {
      const parsed = parseFacts(answers);
      const uncertainty = describeUncertainFacts(answers, parsed.uncertain);
      const core: AdvisorResultCore = {
        nextQuestion,
        completed: false,
        coordinatorSummary: '',
        recommendations: [],
        metrics: [],
        followUps: [],
        uncertainty
      };
      return attachEngine(core, 'gpt', false, 'Propulsé par OpenAI');
    }

    const core = await buildGptCore(answers);
    return attachEngine(core, 'gpt', false, `Propulsé par OpenAI ${env.OPENAI_MODEL || 'gpt-4.1'}`);
  }

  const core = buildHeuristicCore(answers);
  return attachEngine(core, 'heuristic', false);
}

export function getAdvisorQuestions() {
  return listAdvisorQuestions();
}
