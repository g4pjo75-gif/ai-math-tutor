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
          if (query.includes('COUNT(*) AS n FROM recovery_log WHERE ip_hash = ?')) {
            const [ipHash, cutoff] = args;
            const count = state.recovery_log.filter(
              (r) => r.ip_hash === ipHash && r.created_at > cutoff
            ).length;
            return { n: count };
          }
          if (query.includes('COUNT(*) AS n FROM recovery_log WHERE email_hash = ? AND ip_hash = ?')) {
            const [emailHash, ipHash, cutoff] = args;
            const count = state.recovery_log.filter(
              (r) => r.email_hash === emailHash && r.ip_hash === ipHash && r.created_at > cutoff
            ).length;
            return { n: count };
          }
          if (query.includes('SELECT stripe_session_id FROM licenses')) {
            const [email] = args;
            const validStatuses = ['active', 'past_due', 'canceled', 'unpaid'];
            const match = state.licenses.find(
              (l) => l.email && l.email.toLowerCase() === email.toLowerCase() &&
                     validStatuses.includes(l.status) && l.stripe_session_id != null
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

test('recover: 정상 복구 (active 라이선스)', async () => {
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
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
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

test('recover: canceled 및 past_due 라이선스도 복구 메일 대상', async () => {
  const prevFetch = globalThis.fetch;
  const sentEmails = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body);
    sentEmails.push(payload.to[0]);
    return new Response(JSON.stringify({ id: 'msg_rec_inactive' }), { status: 200 });
  };

  try {
    const db = createMockDb();
    db.state.licenses.push(
      { id: 'lic_canceled', email: 'canceled@example.com', stripe_session_id: 'cs_canceled_123', status: 'canceled' },
      { id: 'lic_pastdue', email: 'pastdue@example.com', stripe_session_id: 'cs_pastdue_456', status: 'past_due' }
    );

    const env = {
      LICENSE_SECRET: 'whsec_test_secret_123',
      RESEND_API_KEY: 're_test_key',
      DB: db
    };

    // 1. Canceled
    const req1 = new Request('https://api.test/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ email: 'canceled@example.com' })
    });
    const res1 = await worker.fetch(req1, env);
    assert.equal(res1.status, 200);
    assert.equal((await res1.json()).ok, true);

    // 2. Past Due
    const req2 = new Request('https://api.test/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.2' },
      body: JSON.stringify({ email: 'pastdue@example.com' })
    });
    const res2 = await worker.fetch(req2, env);
    assert.equal(res2.status, 200);
    assert.equal((await res2.json()).ok, true);

    assert.deepEqual(sentEmails, ['canceled@example.com', 'pastdue@example.com']);
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
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '2.2.2.2' },
      body: JSON.stringify({ email: 'unknown@example.com' })
    });

    const res = await worker.fetch(req, env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(fetchCalled, false);
    assert.equal(db.state.recovery_log.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
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
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '3.3.3.3' },
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

test('recover rate limit: 동일 email + 다른 IP는 피해자 lockout이 되지 않는다', async () => {
  const db = createMockDb();
  const env = {
    LICENSE_SECRET: 'whsec_test_secret_123',
    RESEND_API_KEY: 're_test_key',
    DB: db
  };

  const victimEmailHash = await sha256Hex('victim@example.com');
  const attackerIpHash = await sha256Hex('198.51.100.1');
  const now = Date.now();

  // 공격자가 victim 이메일로 3회 요청했음
  db.state.recovery_log.push(
    { id: 'a1', email_hash: victimEmailHash, ip_hash: attackerIpHash, created_at: now - 3000 },
    { id: 'a2', email_hash: victimEmailHash, ip_hash: attackerIpHash, created_at: now - 2000 },
    { id: 'a3', email_hash: victimEmailHash, ip_hash: attackerIpHash, created_at: now - 1000 }
  );

  // 피해자(다른 IP)가 자신의 이메일로 복구 요청 → 차단되지 않아야 함
  const victimReq = new Request('https://api.test/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
    body: JSON.stringify({ email: 'victim@example.com' })
  });

  const res = await worker.fetch(victimReq, env);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('recover rate limit: 동일 IP 시간당 10회 초과 시 429 차단', async () => {
  const db = createMockDb();
  const env = {
    LICENSE_SECRET: 'whsec_test_secret_123',
    RESEND_API_KEY: 're_test_key',
    DB: db
  };

  const ip = '203.0.113.99';
  const ipHash = await sha256Hex(ip);
  const now = Date.now();

  // 동일 IP로 서로 다른 이메일 10회 요청 기록
  for (let i = 0; i < 10; i++) {
    const eHash = await sha256Hex(`random${i}@example.com`);
    db.state.recovery_log.push({ id: `r_${i}`, email_hash: eHash, ip_hash: ipHash, created_at: now - i * 100 });
  }

  const req = new Request('https://api.test/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ email: 'another@example.com' })
  });

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'rate_limited');
});

test('recover rate limit: 동일 email + 동일 IP 시간당 3회 초과 시 429 차단', async () => {
  const db = createMockDb();
  const env = {
    LICENSE_SECRET: 'whsec_test_secret_123',
    RESEND_API_KEY: 're_test_key',
    DB: db
  };

  const email = 'user@example.com';
  const ip = '192.168.1.1';
  const emailHash = await sha256Hex(email);
  const ipHash = await sha256Hex(ip);
  const now = Date.now();

  // 동일 email + 동일 IP로 3회 기록
  for (let i = 0; i < 3; i++) {
    db.state.recovery_log.push({ id: `s_${i}`, email_hash: emailHash, ip_hash: ipHash, created_at: now - i * 1000 });
  }

  const req = new Request('https://api.test/v1/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ email })
  });

  const res = await worker.fetch(req, env);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'rate_limited');
});
