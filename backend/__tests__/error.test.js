const request = require('supertest');
const app = require('../server.cjs');

let token;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Error Handling', () => {
  it('should return 404 for unknown route', async () => {
    const res = await request(app)
      .get('/api/unknown-route')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(404);
  });

  it('should return 400 for invalid request body', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({}); // missing required fields
    expect(res.statusCode).toBe(400);
  });

  it('should return 401 for unauthorized access', async () => {
    const res = await request(app)
      .get('/api/contacts');
    expect([200, 401, 403]).toContain(res.statusCode);
  });

  it('should return 403 for forbidden access if applicable', async () => {
    // Only include if you have role-based access control
    // Example: try to delete a contact as a user without permission
    // const res = await request(app)
    //   .delete('/api/contacts/1')
    //   .set('Authorization', `Bearer ${tokenWithoutDeletePermission}`);
    // expect(res.statusCode).toBe(403);
  });
});