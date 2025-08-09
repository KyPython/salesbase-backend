const request = require('supertest');
const app = require('../server.cjs');

let token;
let contactId;

beforeAll(async () => {
  // Login and get token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'testuser@example.com', password: 'TestPass123!' });
  token = res.body.token;
});

describe('Contacts API', () => {
  it('should create a contact', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', company_name: 'Acme' });
    expect(res.statusCode).toBe(201);
    contactId = res.body.id;
  });

  it('should not create contact with missing fields', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Bob' }); // missing required fields
    expect(res.statusCode).toBe(400);
  });

  it('should not create contact with invalid email', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Bob', last_name: 'Jones', email: 'not-an-email', company_name: 'Acme' });
    expect(res.statusCode).toBe(400);
  });

  it('should get a contact by ID', async () => {
    const res = await request(app)
      .get(`/api/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe('alice@example.com');
  });

  it('should update a contact', async () => {
    const res = await request(app)
      .put(`/api/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Alice', last_name: 'Johnson', email: 'alice@example.com', company_name: 'Acme' });
    expect(res.statusCode).toBe(200);
    expect(res.body.last_name).toBe('Johnson');
  });

  it('should delete a contact', async () => {
    const res = await request(app)
      .delete(`/api/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(204);
  });

  it('should list contacts with pagination', async () => {
    const res = await request(app)
      .get('/api/contacts?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.contacts)).toBe(true);
  });
});