/**
 * Unit tests for JWT auth middleware and helpers.
 */

import request from 'supertest';
import express from 'express';
import { requireJwt, isAdmin, resetAuthCaches } from './jwt';

const app = express();
app.use(express.json());
app.get('/protected', requireJwt, (req, res) => {
  res.json({ userId: req.auth?.userId ?? 'unknown' });
});

describe('auth/jwt', () => {
  beforeEach(() => {
    resetAuthCaches();
  });

  describe('requireJwt', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Missing|Authorization/i);
    });

    it('returns 401 when Authorization is not Bearer', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Basic foo');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Bearer|Authorization/i);
    });

    it('returns 401 when token is invalid (malformed)', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer not-a-valid-jwt');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('isAdmin', () => {
    const origAdminSubs = process.env.ADMIN_SUBS;

    afterEach(() => {
      process.env.ADMIN_SUBS = origAdminSubs;
      resetAuthCaches();
    });

    it('returns false when ADMIN_SUBS is not set', () => {
      delete process.env.ADMIN_SUBS;
      resetAuthCaches();
      expect(isAdmin('any-uuid')).toBe(false);
    });

    it('returns true when userId is in ADMIN_SUBS', () => {
      process.env.ADMIN_SUBS = 'uuid1,uuid2,uuid3';
      resetAuthCaches();
      expect(isAdmin('uuid1')).toBe(true);
      expect(isAdmin('uuid2')).toBe(true);
    });

    it('returns false when userId is not in ADMIN_SUBS', () => {
      process.env.ADMIN_SUBS = 'uuid1,uuid2';
      resetAuthCaches();
      expect(isAdmin('other-uuid')).toBe(false);
    });
  });
});
