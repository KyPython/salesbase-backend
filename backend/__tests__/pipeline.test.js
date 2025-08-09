const request = require('supertest');
const app = require('../server.cjs');

// Optionally, mock Redis if you want to test caching logic
jest.mock('../cache.js', () => ({
  getOrSetCache: jest.fn(async (key, fetchFunc, ttl) => {
    // Always call fetchFunc for testing, simulating cache miss
    return await fetchFunc();
  }),
}));

let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Pipeline Analytics API', () => {
  it('should return pipeline analytics overview', async () => {
    const res = await request(app)
      .get('/api/pipeline/analytics/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.pipeline_stages).toBeDefined();
    expect(res.body.pipeline_summary).toBeDefined();
    expect(res.body.last_updated).toBeDefined();
  });

  it('should use caching logic for analytics overview', async () => {
    // This test will use the mocked getOrSetCache above
    const res = await request(app)
      .get('/api/pipeline/analytics/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.pipeline_stages).toBeDefined();
  });
});