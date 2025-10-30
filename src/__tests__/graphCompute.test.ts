import request from 'supertest';
import { app } from '../server/app';
import { resetComputeRegistry, registerCompute, type DagNodeId } from '../server/lib/dag';

jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => { req.userId = 1; next(); }
}));

// Simple helper to capture call order
function makeRecorder(label: DagNodeId, calls: DagNodeId[]) {
  return async () => {
    calls.push(label);
    return { at: new Date().toISOString(), status: 'ok', details: { node: label, kind: 'mock' } } as const;
  };
}

describe('Graph compute order and outputs', () => {
  beforeEach(() => {
    resetComputeRegistry();
  });

  it('runs compute functions in topological order from Tax and returns outputs', async () => {
    const calls: DagNodeId[] = [];
    registerCompute('Compta', makeRecorder('Compta', calls));
    registerCompute('Previsions', makeRecorder('Previsions', calls));
    registerCompute('Decideur', makeRecorder('Decideur', calls));

    const res = await request(app)
      .post('/api/graph/recalc')
      .set('Authorization', 'Bearer fake')
      .send({ source: 'Tax' })
      .expect(200);

    // Expected order (downstream of Tax): Compta -> Previsions -> Decideur
    expect(res.body.order).toEqual(['Compta', 'Previsions', 'Decideur']);

    // Ensure our mocks were called in this exact order
    expect(calls).toEqual(['Compta', 'Previsions', 'Decideur']);

    // Outputs should include each node with our 'mock' details
    expect(res.body.outputs.Compta.details.kind).toBe('mock');
    expect(res.body.outputs.Previsions.details.kind).toBe('mock');
    expect(res.body.outputs.Decideur.details.kind).toBe('mock');
  });
});
