// server/test/budget.test.js — 예산 가드 단위 테스트
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBudget } from '../src/budget.js';
import { solveProxy } from '../src/solve.js';

function createMockDb(dailyTotal = 0, monthlyTotal = 0) {
  return {
    prepare: (query) => ({
      bind: () => ({
        first: async () => {
          if (query.includes('WHERE created_at >=')) {
            return { total: dailyTotal };
          }
          if (query.includes('WHERE period =')) {
            return { total: monthlyTotal };
          }
          return { total: 0 };
        }
      })
    })
  };
}

test('budget: limit 0 또는 미설정 시 비활성', async () => {
  const env1 = {};
  const r1 = await checkBudget(env1);
  assert.equal(r1.allowed, true);

  const env2 = {
    DAILY_COST_LIMIT_MICRO_YEN: '0',
    MONTHLY_COST_LIMIT_MICRO_YEN: '0',
    DB: createMockDb(99999999, 99999999)
  };
  const r2 = await checkBudget(env2);
  assert.equal(r2.allowed, true);
});

test('budget: 한도 이하일 때 허용', async () => {
  const env = {
    DAILY_COST_LIMIT_MICRO_YEN: '100000000', // 100 JPY
    MONTHLY_COST_LIMIT_MICRO_YEN: '1000000000', // 1,000 JPY
    DB: createMockDb(50000000, 500000000)
  };
  const r = await checkBudget(env);
  assert.equal(r.allowed, true);
});

test('budget: 일 한도 초과 시 거부 (503 budget_exceeded 대상)', async () => {
  const env = {
    DAILY_COST_LIMIT_MICRO_YEN: '100000000', // 100 JPY
    MONTHLY_COST_LIMIT_MICRO_YEN: '1000000000', // 1,000 JPY
    DB: createMockDb(100000000, 500000000) // 일 한도 도달
  };
  const r = await checkBudget(env);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'daily_budget_exceeded');
});

test('budget: 월 한도 초과 시 거부', async () => {
  const env = {
    DAILY_COST_LIMIT_MICRO_YEN: '100000000',
    MONTHLY_COST_LIMIT_MICRO_YEN: '1000000000',
    DB: createMockDb(10000000, 1000000001) // 월 한도 초과
  };
  const r = await checkBudget(env);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'monthly_budget_exceeded');
});

test('solveProxy: budget_exceeded 시 503 에러 반환', async () => {
  const env = {
    GEMINI_API_KEY: 'test_key',
    DAILY_COST_LIMIT_MICRO_YEN: '1000',
    DB: {
      prepare: (q) => ({
        bind: () => ({
          first: async () => {
            if (q.includes('COUNT(*) AS n FROM usage')) return { n: 0 };
            if (q.includes('COALESCE(SUM(cost_micro_yen), 0) AS total FROM usage WHERE created_at >=')) return { total: 5000 };
            return null;
          }
        })
      })
    }
  };
  const res = await solveProxy(env, { id: 'lic_1', call_limit: 300 }, { prompt: '1+1' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'budget_exceeded');
});
