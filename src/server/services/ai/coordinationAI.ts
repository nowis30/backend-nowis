import { evaluateScenario, saveScenario, type EvaluateScenarioInput, type EvaluatedScenario } from '../leverageService';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'percent',
    maximumFractionDigits: value < 0.1 ? 2 : 1
  }).format(value);
}

function buildHighlights(summary: EvaluatedScenario): string[] {
  const highlights: string[] = [];

  highlights.push(
    `Service de la dette: ${formatCurrency(summary.annualDebtService)} pour une rente attendue de ${formatCurrency(summary.expectedInvestmentReturn)}.`
  );

  if (summary.netExpectedDelta >= 0) {
    highlights.push(`Gain net attendu apres impots: ${formatCurrency(summary.netExpectedDelta)}.`);
  } else {
    highlights.push(`Ecart negatif estime: ${formatCurrency(summary.netExpectedDelta)} (scenario defavorable).`);
  }

  highlights.push(
    `Rendement seuil pour equilibrer l'emprunt: ${formatPercent(summary.breakEvenReturn)}.`
  );

  return highlights;
}

function buildNarrative(summary: EvaluatedScenario): string {
  const lines: string[] = [];

  lines.push(
    `Le scenario projette un flux de service de la dette de ${formatCurrency(summary.annualDebtService)} dont ${formatCurrency(summary.annualInterestCost)} d'interets (${formatCurrency(summary.afterTaxDebtCost)} apres impots).`
  );

  const deltaDescriptor = summary.netExpectedDelta >= 0 ? 'un excedent' : 'un deficit';
  lines.push(
    `Avec un rendement attendu de ${formatCurrency(summary.expectedInvestmentReturn)}, le modele anticipe ${deltaDescriptor} de ${formatCurrency(summary.netExpectedDelta)} sur l'annee courante.`
  );

  if (summary.cashflowImpact >= 0) {
    lines.push(
      `Le cashflow net demeure positif a ${formatCurrency(summary.cashflowImpact)} apres paiement de la dette.`
    );
  } else {
    lines.push(
      `Le cashflow net est negatif de ${formatCurrency(Math.abs(summary.cashflowImpact))}; prevoir un coussin de tresorerie.`
    );
  }

  lines.push(
    `Le rendement minimal pour equilibrer l'emprunt est ${formatPercent(summary.breakEvenReturn)}; au-dela, la strategie ajoute de la valeur nette.`
  );

  return lines.join(' ');
}

export type LeverageConversationInput = EvaluateScenarioInput & {
  save?: boolean;
};

export type LeverageConversationResult = {
  summary: EvaluatedScenario;
  narrative: string;
  highlights: string[];
  savedScenarioId?: number;
};

export async function runLeverageConversation(
  input: LeverageConversationInput
): Promise<LeverageConversationResult> {
  const summary = evaluateScenario(input);
  const highlights = buildHighlights(summary);
  const narrative = buildNarrative(summary);

  let savedScenarioId: number | undefined;
  if (input.save) {
    const stored = await saveScenario(input, summary);
    savedScenarioId = stored.id;
  }

  return {
    summary,
    narrative,
    highlights,
    savedScenarioId
  };
}
