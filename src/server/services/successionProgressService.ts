import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { roundDecimal } from './successionCalculator';

export type SuccessionStepStatus = 'todo' | 'in_progress' | 'done';

export interface SuccessionProgressStep {
  id: string;
  label: string;
  status: SuccessionStepStatus;
  summary?: string;
  blockers?: string[];
  completedAt?: string | null;
}

export interface SuccessionProgressSnapshot {
  id: number;
  scenarioId: number;
  generatedAt: string;
  inputs: {
    targetFreezeYear: number;
    generations: number;
    reinvestmentRatePercent: number;
    marginalTaxRatePercent: number;
    dividendRetentionPercent: number;
  };
  metrics?: {
    preferredShareValue: number;
    capitalGainTriggered: number;
    capitalGainTax: number;
    totalDividends: number;
    totalAfterTaxRetained: number;
    latentTaxBefore: number;
    latentTaxAfter: number;
  };
  notes?: Prisma.JsonValue | null;
  counts?: {
    redemptions: number;
    dividends: number;
    beneficiaries: number;
  };
}

export interface SuccessionProgressReport {
  generatedAt: string;
  completionRatio: number;
  steps: SuccessionProgressStep[];
  stats: {
    shareholders: number;
    trusts: number;
    assets: number;
    scenarios: number;
    simulations: number;
  };
  latestSimulation?: SuccessionProgressSnapshot;
  nextAction: {
    stepId: string | null;
    label: string;
    suggestion: string;
  };
}

function buildFoundationsBlockers(
  hasShareholders: boolean,
  hasAssets: boolean
): string[] {
  const blockers: string[] = [];

  if (!hasShareholders) {
    blockers.push('Ajouter au moins un actionnaire afin de définir les bénéficiaires potentiels.');
  }

  if (!hasAssets) {
    blockers.push('Enregistrer les actifs à geler (entreprises, immeubles, portefeuilles).');
  }

  return blockers;
}

function resolveNextAction(steps: SuccessionProgressStep[]): SuccessionProgressReport['nextAction'] {
  const suggestions: Record<string, string> = {
    foundations: "Ajoutez vos actionnaires et au moins un actif à geler pour poser les bases du plan.",
    scenario: 'Créez un scénario de gel en sélectionnant les actifs et la fiducie cible.',
    simulation: 'Exécutez une simulation de gel pour projeter les valeurs et les flux.',
    analysis: 'Analysez les résultats, documentez les conclusions et préparez les suivis clients.'
  };

  const nextStep = steps.find((step) => step.status !== 'done');

  if (!nextStep) {
    return {
      stepId: null,
      label: 'Plan de succession complété',
      suggestion: 'Vous pouvez lancer une nouvelle simulation ou générer le rapport détaillé pour le client.'
    };
  }

  return {
    stepId: nextStep.id,
    label: nextStep.label,
    suggestion: suggestions[nextStep.id] ?? 'Prochaine étape à réaliser dans le parcours succession.'
  };
}

export async function buildSuccessionProgressReport(userId: number): Promise<SuccessionProgressReport> {
  const [
    shareholderCount,
    trustCount,
    assetCount,
    scenarioCount,
    simulationCount,
    latestSimulationRecord
  ] = await Promise.all([
    prisma.shareholder.count({ where: { userId } }),
    prisma.familyTrust.count({ where: { userId } }),
    prisma.freezeAsset.count({ where: { userId } }),
    prisma.freezeScenario.count({ where: { userId } }),
    prisma.freezeSimulation.count({ where: { userId } }),
    prisma.freezeSimulation.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        result: true,
        _count: {
          select: {
            redemptions: true,
            dividends: true,
            beneficiaryResults: true
          }
        }
      }
    })
  ]);

  const hasShareholders = shareholderCount > 0;
  const hasAssets = assetCount > 0;
  const foundationsComplete = hasShareholders && hasAssets;
  const foundationsStarted = hasShareholders || hasAssets || trustCount > 0;

  const foundationStatus: SuccessionStepStatus = foundationsComplete
    ? 'done'
    : foundationsStarted
      ? 'in_progress'
      : 'todo';

  const scenarioStatus: SuccessionStepStatus = scenarioCount > 0
    ? 'done'
    : foundationsComplete
      ? 'in_progress'
      : 'todo';

  const simulationStatus: SuccessionStepStatus = simulationCount > 0
    ? 'done'
    : scenarioCount > 0
      ? 'in_progress'
      : 'todo';

  const analysisStatus: SuccessionStepStatus = simulationCount > 0 ? 'done' : 'todo';

  let latestSimulation: SuccessionProgressSnapshot | undefined;

  if (latestSimulationRecord) {
    const result = latestSimulationRecord.result;

    latestSimulation = {
      id: latestSimulationRecord.id,
      scenarioId: latestSimulationRecord.scenarioId,
      generatedAt: latestSimulationRecord.createdAt.toISOString(),
      inputs: {
        targetFreezeYear: latestSimulationRecord.targetFreezeYear,
        generations: latestSimulationRecord.generations,
        reinvestmentRatePercent: roundDecimal(latestSimulationRecord.reinvestmentRatePercent),
        marginalTaxRatePercent: roundDecimal(latestSimulationRecord.marginalTaxRatePercent),
        dividendRetentionPercent: roundDecimal(latestSimulationRecord.dividendRetentionPercent)
      },
      metrics: result
        ? {
            preferredShareValue: roundDecimal(result.preferredShareValue),
            capitalGainTriggered: roundDecimal(result.capitalGainTriggered),
            capitalGainTax: roundDecimal(result.capitalGainTax),
            totalDividends: roundDecimal(result.totalDividends),
            totalAfterTaxRetained: roundDecimal(result.totalAfterTaxRetained),
            latentTaxBefore: roundDecimal(result.latentTaxBefore),
            latentTaxAfter: roundDecimal(result.latentTaxAfter)
          }
        : undefined,
      notes: result?.notes ?? null,
      counts: {
        redemptions: latestSimulationRecord._count.redemptions ?? 0,
        dividends: latestSimulationRecord._count.dividends ?? 0,
        beneficiaries: latestSimulationRecord._count.beneficiaryResults ?? 0
      }
    };
  }

  const steps: SuccessionProgressStep[] = [
    {
      id: 'foundations',
      label: 'Préparer les données succession',
      status: foundationStatus,
      summary: `Actionnaires: ${shareholderCount}, Actifs à geler: ${assetCount}, Fiducies: ${trustCount}`,
      blockers: foundationStatus === 'done' ? undefined : buildFoundationsBlockers(hasShareholders, hasAssets)
    },
    {
      id: 'scenario',
      label: 'Structurer un scénario de gel',
      status: scenarioStatus,
      summary: scenarioCount > 0 ? `${scenarioCount} scénario(x) actif(s)` : 'Aucun scénario défini',
      blockers:
        scenarioStatus === 'done'
          ? undefined
          : foundationsComplete
            ? undefined
            : ['Compléter les actionnaires et les actifs avant de créer un scénario.']
    },
    {
      id: 'simulation',
      label: 'Lancer une simulation de gel',
      status: simulationStatus,
      summary: simulationCount > 0 ? `${simulationCount} simulation(s) réalisée(s)` : 'Aucune simulation disponible',
      blockers:
        simulationStatus === 'done'
          ? undefined
          : scenarioCount > 0
            ? undefined
            : ['Créer un scénario de gel avant de lancer une simulation.'],
      completedAt: latestSimulation?.generatedAt ?? null
    },
    {
      id: 'analysis',
      label: 'Analyser les résultats et planifier les suivis',
      status: analysisStatus,
      summary: latestSimulation
        ? `Dernière simulation le ${new Date(latestSimulation.generatedAt).toLocaleDateString('fr-CA')}`
        : 'Les résultats seront disponibles après une première simulation.',
      blockers:
        analysisStatus === 'done'
          ? undefined
          : ['Réaliser au moins une simulation pour disposer de résultats exploitables.'],
      completedAt: analysisStatus === 'done' ? latestSimulation?.generatedAt ?? null : null
    }
  ];

  const completionRatio = steps.filter((step) => step.status === 'done').length / steps.length;

  return {
    generatedAt: new Date().toISOString(),
    completionRatio,
    steps,
    stats: {
      shareholders: shareholderCount,
      trusts: trustCount,
      assets: assetCount,
      scenarios: scenarioCount,
      simulations: simulationCount
    },
    latestSimulation,
    nextAction: resolveNextAction(steps)
  };
}
