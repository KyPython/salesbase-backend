const request = require('supertest');
const app = require('../server.cjs');

let token;
let dealId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Deals API', () => {
  it('should create a deal', async () => {
    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_id: 1, value: 10000, status: 'open', pipeline_stage_id: 1 });
    expect(res.statusCode).toBe(201);
    dealId = res.body.id;
  });

  it('should get a deal by ID', async () => {
    const res = await request(app)
      .get(`/api/deals/${dealId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(dealId);
  });

  it('should update a deal', async () => {
    const res = await request(app)
      .put(`/api/deals/${dealId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 12000, status: 'open', pipeline_stage_id: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body.value).toBe(12000);
    expect(res.body.pipeline_stage_id).toBe(2);
  });

  it('should change deal stage (automation trigger)', async () => {
    const res = await request(app)
      .put(`/api/deals/${dealId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pipeline_stage_id: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.pipeline_stage_id).toBe(3);
    // Optionally check for automation effects if your API returns them
  });

  it('should filter, sort, and paginate deals', async () => {
    const res = await request(app)
      .get('/api/deals?status=open&sort=value&page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.deals)).toBe(true);
  });

  it('should delete a deal', async () => {
    const res = await request(app)
      .delete(`/api/deals/${dealId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(204);
  });
});