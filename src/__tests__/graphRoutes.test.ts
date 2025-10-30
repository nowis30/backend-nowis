import request from 'supertest';
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => { req.userId = 1; next(); }
}));

import { app } from '../server/app';

describe('Graph routes', () => {
  it('lists nodes', async () => {
    const res = await request(app).get('/api/graph/nodes').set('Authorization', 'Bearer fake').expect(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes.length).toBeGreaterThan(0);
  });

  it('recalc from Tax yields topo-ordered downstream nodes', async () => {
    const res = await request(app)
      .post('/api/graph/recalc')
      .set('Authorization', 'Bearer fake')
      .send({ source: 'Tax' })
      .expect(200);
    expect(Array.isArray(res.body.order)).toBe(true);
    // For our small graph, Tax -> Compta -> Previsions -> Decideur
    const order = res.body.order;
    const idx = (n: string) => order.indexOf(n);
    expect(idx('Compta')).toBeGreaterThanOrEqual(0);
    expect(idx('Previsions')).toBeGreaterThan(idx('Compta'));
    expect(idx('Decideur')).toBeGreaterThan(idx('Previsions'));
  });
});
