/// <reference types="jest" />
import request from 'supertest';

import { app } from '../server/app';

describe('GET /health', () => {
  it('répond avec un statut ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
