const request = require('supertest');
const app = require('../server.cjs'); // Using server.cjs for testing

describe('Authentication Middleware', () => {
    let token;

    beforeAll(async () => {
        // Assuming you have a way to get a valid token for testing
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'testuser@example.com', password: 'TestPass123!' });
        token = res.body.token;
    });

    test('should allow access with a valid token', async () => {
        const res = await request(app)
            .get('/api/protected-route') // Replace with your protected route
            .set('Authorization', `Bearer ${token}`);
        expect(res.statusCode).toBe(200);
    });

    test('should deny access with a malformed token', async () => {
        const res = await request(app)
            .get('/api/protected-route')
            .set('Authorization', 'Bearer malformedtoken');
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('Invalid or expired token.');
    });

    test('should deny access with an expired token', async () => {
        // Simulate an expired token scenario
        const expiredToken = 'expiredtoken'; // Replace with a method to generate an expired token
        const res = await request(app)
            .get('/api/protected-route')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toBe('Invalid or expired token.');
    });
});