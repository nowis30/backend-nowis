export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

export function percentToRate(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return percent / 100;
}
