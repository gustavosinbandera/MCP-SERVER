/**
 * Phase 4/6 - Gateway unit tests
 */

import request from 'supertest';
import { app } from './index';

describe('MCP Gateway', () => {
  it('health endpoint returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('mcp-gateway');
  });

  it('root returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('MCP Knowledge Hub');
    expect(res.body.endpoints.search).toBeDefined();
  });

  it('search endpoint exists', async () => {
    const res = await request(app).get('/search');
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
    }
  });
});
