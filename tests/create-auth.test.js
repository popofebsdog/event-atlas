import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

for (const path of ['/api/projects', '/api/projects/example/events']) {
  for (const key of [undefined, 'wrong-key']) {
    test(`POST ${path} rejects ${key ? 'incorrect' : 'missing'} key before validation or database access`, async () => {
      const response = await worker.fetch(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { Origin: 'http://localhost:5174', 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: '{}',
      }), { ALLOWED_ORIGINS: 'http://localhost:5174', ADMIN_TOKEN: 'test-key', LOCAL_DEV: 'true' });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, '需要管理員權限');
    });
  }
  test(`POST ${path} fails closed when administrator secret is not configured`, async () => {
    const response = await worker.fetch(new Request(`http://localhost${path}`, {
      method: 'POST', headers: { Origin: 'http://localhost:5174', 'Content-Type': 'application/json', Authorization: 'Bearer undefined' }, body: '{}',
    }), { ALLOWED_ORIGINS: 'http://localhost:5174' });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, '需要管理員權限');
  });
}
