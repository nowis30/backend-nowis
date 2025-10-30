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

// --- Simple compute outputs (in-memory) ---
type NodeOutput = { at: string; status: 'ok'; details?: Record<string, unknown> };
const lastOutputs: Record<DagNodeId, NodeOutput | undefined> = { Tax: undefined, Immobilier: undefined, Compta: undefined, Previsions: undefined, Decideur: undefined };

// --- Compute registry (injectable for real computations or tests) ---
export type ComputeFn = (node: DagNodeId) => Promise<NodeOutput> | NodeOutput;

const defaultCompute: ComputeFn = (id) => {
  const out: NodeOutput = { at: new Date().toISOString(), status: 'ok', details: { node: id, kind: 'default' } };
  lastOutputs[id] = out;
  return out;
};

const computeRegistry: Record<DagNodeId, ComputeFn> = {
  Tax: defaultCompute,
  Immobilier: defaultCompute,
  Compta: defaultCompute,
  Previsions: defaultCompute,
  Decideur: defaultCompute
};

export function registerCompute(node: DagNodeId, fn: ComputeFn): void {
  computeRegistry[node] = fn;
}

export function resetComputeRegistry(): void {
  computeRegistry.Tax = defaultCompute;
  computeRegistry.Immobilier = defaultCompute;
  computeRegistry.Compta = defaultCompute;
  computeRegistry.Previsions = defaultCompute;
  computeRegistry.Decideur = defaultCompute;
}

export async function runComputeOrder(order: DagNodeId[]): Promise<Record<DagNodeId, NodeOutput>> {
  const outputs: Record<DagNodeId, NodeOutput> = {} as any;
  for (const n of order) {
    const out = await computeRegistry[n](n);
    lastOutputs[n] = out;
    outputs[n] = out;
  }
  return outputs;
}

export function getLastOutputs(): Record<DagNodeId, NodeOutput | undefined> { return { ...lastOutputs }; }
