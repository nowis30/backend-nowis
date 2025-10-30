import request from 'supertest';
import { beforeEach, describe, expect, it } from '@jest/globals';

jest.mock('../server/middlewares/authenticated', () => ({
  authenticated: (req: any, _res: any, next: any) => {
    req.userId = 1;
    next();
  }
}));

import { app } from '../server/app';
import { publish } from '../server/lib/events';

describe('GET /api/events/recent', () => {
  beforeEach(() => {
    // generate a couple of events
    publish({ type: 'test.event', at: new Date().toISOString(), userId: 1, payload: { x: 1 } });
    publish({ type: 'another.event', at: new Date().toISOString(), userId: 1, payload: { y: 2 } });
  });

  it('returns recent events', async () => {
    const res = await request(app)
      .get('/api/events/recent?limit=2')
      .set('Authorization', 'Bearer fake')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('type');
  });
});
