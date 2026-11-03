// server/test/recover.test.js — 라이선스 복구 API 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { sha256Hex } from '../src/license.js';

function createMockDb() {
  const state = {
    licenses: [],
    recovery_log: []
  };

  return {
    state,
    prepare: (query) => ({
      bind: (...args) => ({
        first: async () => {
          if (query.includes('COUNT(*) AS n FROM recovery_log')) {
            const [emailHash, ipHash, cutoff] = args;
            const count = state.recovery_log.filter(
              (r) => (r.email_hash === emailHash || r.ip_hash === ipHash) && r.created_at > cutoff
            ).length;
            return { n: count };
          }
          if (query.includes('SELECT stripe_session_id FROM licenses')) {
            const [email, status] = args;
            const match = state.licenses.find(
              (l) => l.email && l.email.toLowerCase() === email.toLowerCase() &&
                     l.status === status && l.stripe_session_id != null
            );
            return match || null;
          }
          return null;
        },
        run: async () => {
          if (query.includes('INSERT INTO recovery_log')) {
            const [id, email_hash, ip_hash, created_at] = args;
            state.recovery_log.push({ id, email_hash, ip_hash, created_at });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      })
    })
  };
}

test('recover: 정상 복구 (라이선스 발견 시 이메일 발송 및 {ok:true} 반환)', async () => {
  const prevFetch = globalThis.fetch;
  let sentTo = null;
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    sentTo = payload.to[0];
    return new Response(JSON.stringify({ id: 'msg_rec_1' }), { status: 200 });
  };

  try {
    const db = createMockDb();
    db.state.licenses.push({
      id: 'lic_1',
      email: 'user@example.com',
      stripe_session_id: 'cs_test_active_123',
      status: 'active'
    });

    const env = {
      LICENSE_SECRET: 'whsec_test_secret_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    const req = new Request('https://api.test/v1/recover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '1.2.3.4'
      },
      body: JSON.stringify({ email: 'USER@example.com' })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(sentTo, 'user@example.com');
    assert.equal(db.state.recovery_log.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('recover: 없는 이메일이어도 enumeration 방지를 위해 {ok:true} generic 응답', async () => {
  const prevFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    const db = createMockDb();
    const env = {
      LICENSE_SECRET: 'whsec_test_secret_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    const req = new Request('https://api.test/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(fetchCalled, false); // 메일 발송 안 됨
    assert.equal(db.state.recovery_log.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('recover: rate limit (동일 email/IP 1시간 3회 초과 시 429)', async () => {
  const db = createMockDb();
  const env = {
    LICENSE_SECRET: 'whsec_test_secret_123',
    RESEND_API_KEY: 're_test_key',
    DB: db
  };

  const emailHash = await sha256Hex('spam@example.com');
  const ipHash = await sha256Hex('192.168.1.100');
  const now = Date.now();

  // 기존 3회 기록 추가
  db.state.recovery_log.push(
    { id: 'r1', email_hash: emailHash, ip_hash: ipHash, created_at: now - 1000 },
    { id: 'r2', email_hash: emailHash, ip_hash: ipHash, created_at: now - 2000 },
    { id: 'r3', email_hash: emailHash, ip_hash: ipHash, created_at: now - 3000 }
  );

  const req = new Request('https://api.test/v1/recover', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '192.168.1.100'
    },
    body: JSON.stringify({ email: 'spam@example.com' })
  });

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, 'rate_limited');
});

test('recover: 수동 발급 키(stripe_session_id 없음)는 메일 발송에서 제외', async () => {
  const prevFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    const db = createMockDb();
    db.state.licenses.push({
      id: 'lic_manual',
      email: 'manual@example.com',
      stripe_session_id: null,
      status: 'active'
    });

    const env = {
      LICENSE_SECRET: 'whsec_test_secret_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    const req = new Request('https://api.test/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manual@example.com' })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
