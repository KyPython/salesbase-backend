const request = require('supertest');
const app = require('../server.cjs');

let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Integrations API', () => {
  it('should accept Zapier webhook payload', async () => {
    const res = await request(app)
      .post('/api/integrations/webhooks/zapier')
      .set('Authorization', `Bearer ${token}`)
      .send({ event: 'test', data: 'sample' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.received).toBeDefined();
  });

  it('should reject Zapier webhook with missing payload', async () => {
    const res = await request(app)
      .post('/api/integrations/webhooks/zapier')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422]).toContain(res.statusCode);
  });

  it('should accept Slack webhook payload', async () => {
    const res = await request(app)
      .post('/api/integrations/webhooks/slack')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Hello from Slack!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.received).toBeDefined();
  });

  it('should reject Slack webhook with missing payload', async () => {
    const res = await request(app)
      .post('/api/integrations/webhooks/slack')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect([400, 422]).toContain(res.statusCode);
  });
});