import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = { ALLOWED_ORIGINS: 'http://localhost:8765,https://g4pjo75-gif.github.io' };

test('GET /health', async () => {
  const res = await worker.fetch(new Request('https://api.test/health'), env, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.version, 'string');
});

test('OPTIONS preflight (allowed origin)', async () => {
  const req = new Request('https://api.test/health', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:8765' }
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8765');
});

test('CORS: unknown origin is not echoed', async () => {
  const req = new Request('https://api.test/health', {
    headers: { Origin: 'https://evil.example' }
  });
  const res = await worker.fetch(req, env, {});
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('404', async () => {
  const res = await worker.fetch(new Request('https://api.test/nope'), env, {});
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'not_found');
});
