import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';

/**
 * End-to-end HTTP tests against the fully-assembled Express app.
 *
 * No database is started: the persistence adapter runs as an in-memory store
 * when `connectMongo()` is never called, so these tests exercise the real
 * middleware pipeline (helmet, CORS, host check, rate limit, body parsing,
 * validation, auth, RBAC, controllers, error handler) deterministically.
 *
 * NOTE: the auth limiter allows 10 credential calls per window, so this file
 * keeps its register/login calls well under that budget.
 */
let app: Express;
const email = `owner_${Date.now()}@example.com`;
const password = 'super-secret-passphrase';
let accessToken = '';

beforeAll(() => {
  app = createApp();
});

const auth = () => ({ Authorization: `Bearer ${accessToken}` });

describe('health & routing', () => {
  it('exposes an unauthenticated health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: 'v1' });
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('auth guards & validation', () => {
  it('rejects an unauthenticated request to a protected route (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a tampered bearer token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me').set({ Authorization: 'Bearer not.a.valid.token' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid registration body with field-level details (400)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });
});

describe('registration → session → profile flow', () => {
  it('registers a new owner and returns an access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Ada Lovelace', orgName: 'Analytical Engines' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('owner');
    expect(res.body.org.name).toBe('Analytical Engines');
    expect(typeof res.body.accessToken).toBe('string');
    accessToken = res.body.accessToken;
  });

  it('returns the current user from /auth/me with the token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it('updates an allow-listed profile field', async () => {
    const res = await request(app).patch('/api/v1/auth/me').set(auth()).send({ name: 'Ada L.' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Ada L.');
  });

  it('rejects mass-assignment of a non-allow-listed field (API3)', async () => {
    const res = await request(app).patch('/api/v1/auth/me').set(auth()).send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('refuses to register the same email twice (409)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Someone Else', orgName: 'Another Org' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects a login with the wrong password (401)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in with the correct password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
  });
});

describe('projects (auth + RBAC + object ownership)', () => {
  let projectId = '';

  it('lets an owner create a project (201)', async () => {
    const res = await request(app).post('/api/v1/projects').set(auth()).send({ name: 'Apollo', description: 'moonshot' });
    expect(res.status).toBe(201);
    expect(res.body.project.name).toBe('Apollo');
    expect(typeof res.body.project.orgId).toBe('string');
    projectId = res.body.project.id;
  });

  it('lists the org projects for the owner', async () => {
    const res = await request(app).get('/api/v1/projects').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('requires authentication to create a project (401)', async () => {
    const res = await request(app).post('/api/v1/projects').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });
});
