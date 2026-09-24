import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

for (const [name, secret, key, status] of [
  ['missing key', 'test-key', null, 403],
  ['wrong key', 'test-key', 'wrong', 403],
  ['unconfigured server', undefined, 'undefined', 403],
  ['correct key', 'test-key', 'test-key', 200],
]) {
  test(`export authorization: ${name}`, async () => {
    const response = await worker.fetch(new Request('https://api.example.com/api/admin/verify', {
      method: 'POST',
      headers: { Origin: 'https://example.com', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    }), { ALLOWED_ORIGINS: 'https://example.com', ADMIN_TOKEN: secret });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), status === 200 ? {ok: true} : {error: '需要管理員權限'});
  });
}
