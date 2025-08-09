const request = require('supertest');
const app = require('../server.cjs');

let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Reports API', () => {
  it('should list reports', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('should filter reports by type', async () => {
    const res = await request(app)
      .get('/api/reports?type=pipeline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('should export report as CSV', async () => {
    const res = await request(app)
      .get('/api/reports/export?type=pipeline')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(','); // crude check for CSV format
  });
});