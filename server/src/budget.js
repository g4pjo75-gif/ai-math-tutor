// server/src/budget.js — 예산 가드 (일간/월간 원가 상한)
import { periodOf } from './license.js';

export async function checkBudget(env, now = Date.now()) {
  const dailyLimit = Number(env.DAILY_COST_LIMIT_MICRO_YEN || 0);
  const monthlyLimit = Number(env.MONTHLY_COST_LIMIT_MICRO_YEN || 0);

  if (dailyLimit <= 0 && monthlyLimit <= 0) {
    return { allowed: true };
  }

  // 일간 사용량: 오늘 00:00:00 UTC 이후의 cost_micro_yen 합
  if (dailyLimit > 0) {
    const todayStart = new Date(now).setUTCHours(0, 0, 0, 0);
    const row = await env.DB.prepare(
      'SELECT COALESCE(SUM(cost_micro_yen), 0) AS total FROM usage WHERE created_at >= ?'
    ).bind(todayStart).first();
    const dailyTotal = Number(row?.total || 0);
    if (dailyTotal >= dailyLimit) {
      return { allowed: false, reason: 'daily_budget_exceeded', total: dailyTotal, limit: dailyLimit };
    }
  }

  // 월간 사용량: 이번 달(periodOf)의 cost_micro_yen 합
  if (monthlyLimit > 0) {
    const period = periodOf(now);
    const row = await env.DB.prepare(
      'SELECT COALESCE(SUM(cost_micro_yen), 0) AS total FROM usage WHERE period = ?'
    ).bind(period).first();
    const monthlyTotal = Number(row?.total || 0);
    if (monthlyTotal >= monthlyLimit) {
      return { allowed: false, reason: 'monthly_budget_exceeded', total: monthlyTotal, limit: monthlyLimit };
    }
  }

  return { allowed: true };
}
