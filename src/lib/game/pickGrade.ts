export type ItemGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradeWeights {
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
}

/**
 * Returns a random grade based on weighted probabilities.
 * Weights are relative — they don't need to sum to 100.
 * Per-item weights override global defaults when provided.
 */
export function pickGrade(
  globalWeights: GradeWeights,
  itemOverride?: Partial<GradeWeights> | null,
): ItemGrade {
  const w: GradeWeights = { ...globalWeights, ...itemOverride };
  const entries: [ItemGrade, number][] = [
    ['S', w.S],
    ['A', w.A],
    ['B', w.B],
    ['C', w.C],
    ['D', w.D],
    ['F', w.F],
  ];

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return 'F';

  let roll = Math.random() * total;
  for (const [grade, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return grade;
  }
  return 'F';
}
