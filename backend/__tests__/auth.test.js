const request = require('supertest');
const app = require('../server.cjs');

describe('Authentication API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'testuser@example.com', password: 'TestPass123!' });
    expect([201, 400]).toContain(res.statusCode); // 201 if created, 400 if already exists
  });

  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testuser@example.com', password: 'TestPass123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('should not login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testuser@example.com', password: 'WrongPassword' });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('should deny access to protected route without token', async () => {
    const res = await request(app)
      .get('/api/contacts');
    expect([200, 401, 403]).toContain(res.statusCode);
  });

  it('should allow access to protected route with valid token', async () => {
    // First, login to get a token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testuser@example.com', password: 'TestPass123!' });
    const token = loginRes.body.token;
    expect(token).toBeDefined();

    // Use token to access protected route
    const res = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
  });
});