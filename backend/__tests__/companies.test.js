const request = require('supertest');
const app = require('../server.cjs');

let token;
let companyId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Companies API', () => {
  it('should create a company', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Inc', industry: 'Tech', website: 'https://acme.com' });
    expect(res.statusCode).toBe(201);
    companyId = res.body.id;
  });

  it('should not create company with missing fields', async () => {
    const res = await request(app)
      .post('/api/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect(res.statusCode).toBe(400);
  });

  it('should get a company by ID', async () => {
    const res = await request(app)
      .get(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Acme Inc');
  });

  it('should update a company', async () => {
    const res = await request(app)
      .put(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Acme Corp', industry: 'Tech', website: 'https://acme.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Acme Corp');
  });

  it('should delete a company', async () => {
    const res = await request(app)
      .delete(`/api/companies/${companyId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(204);
  });

  it('should list companies', async () => {
    const res = await request(app)
      .get('/api/companies')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.companies)).toBe(true);
  });
});