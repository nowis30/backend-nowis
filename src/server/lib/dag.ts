export type DagNodeId = 'Tax' | 'Compta' | 'Immobilier' | 'Previsions' | 'Decideur';

// Edges: from -> to (from updates trigger to recompute)
const edges: Array<[DagNodeId, DagNodeId]> = [
  ['Tax', 'Compta'],
  ['Immobilier', 'Compta'],
  ['Compta', 'Previsions'],
  ['Immobilier', 'Previsions'],
  ['Previsions', 'Decideur']
];

export const nodes: DagNodeId[] = ['Tax', 'Immobilier', 'Compta', 'Previsions', 'Decideur'];

const downstream: Record<DagNodeId, DagNodeId[]> = nodes.reduce((acc, n) => {
  acc[n] = [];
  return acc;
}, {} as Record<DagNodeId, DagNodeId[]>);
for (const [u, v] of edges) downstream[u].push(v);

function topoSort(subset: Set<DagNodeId>): DagNodeId[] {
  // Kahn's algorithm on induced subgraph
  const indeg: Record<DagNodeId, number> = {
    Tax: 0,
    Immobilier: 0,
    Compta: 0,
    Previsions: 0,
    Decideur: 0
  };
  // Reset only for nodes in subset
  for (const n of nodes) if (!subset.has(n)) delete (indeg as Record<string, number>)[n];
  for (const [u, v] of edges) if (subset.has(u) && subset.has(v)) indeg[v] = (indeg[v] ?? 0) + 1;
  const q: DagNodeId[] = [];
  for (const n of Object.keys(indeg) as DagNodeId[]) if ((indeg[n] ?? 0) === 0) q.push(n);
  const order: DagNodeId[] = [];
  while (q.length) {
    const n = q.shift()!;
    order.push(n);
    for (const v of downstream[n] || []) {
      if (!subset.has(v)) continue;
      indeg[v] = (indeg[v] ?? 0) - 1;
      if (indeg[v] === 0) q.push(v);
    }
  }
  return order.filter((n) => subset.has(n));
}

export function impactedNodesFrom(source: DagNodeId): DagNodeId[] {
  // BFS downstream
  const seen = new Set<DagNodeId>();
  const q: DagNodeId[] = [source];
  while (q.length) {
    const n = q.shift()!;
    for (const v of downstream[n] || []) if (!seen.has(v)) { seen.add(v); q.push(v); }
  }
  // Order in topo for determinism
  return topoSort(seen);
}

export type RecalcRun = {
  at: string;
  source: DagNodeId;
  order: DagNodeId[];
};

const runs: RecalcRun[] = [];
export function recordRun(run: RecalcRun) {
  runs.push(run);
  if (runs.length > 100) runs.shift();
}
export function recentRuns(): RecalcRun[] { return runs.slice().reverse(); }
