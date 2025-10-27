import request from 'supertest';

import { app } from '../server/app';

describe('Freeze routes', () => {
  it('refuse l’accès sans authentification', async () => {
    await request(app).get('/api/freeze/shareholders').expect(401);
    await request(app).get('/api/freeze/bootstrap').expect(401);
  });
});
