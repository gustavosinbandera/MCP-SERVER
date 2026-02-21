/**
 * MCP HTTP endpoint tests: auth required, initialize flow.
 */
import request from 'supertest';
import { app } from '../index';

describe('mcp-http', () => {
  describe('POST /mcp', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer invalid-token')
        .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });
      expect(res.status).toBe(401);
    });
  });
});
