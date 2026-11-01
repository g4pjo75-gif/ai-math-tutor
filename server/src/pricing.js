// server/src/pricing.js — 모델별 단가와 원가 계산 (USD/1M tokens → micro-yen)
export const PRICES_USD_PER_M = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-3.6-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 }
};

export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_USD_JPY = 150;

export function costMicroYen(model, tokensIn, tokensOut, usdJpy = DEFAULT_USD_JPY) {
  const p = PRICES_USD_PER_M[model] || PRICES_USD_PER_M[DEFAULT_MODEL];
  const usd = (Number(tokensIn || 0) / 1e6) * p.in + (Number(tokensOut || 0) / 1e6) * p.out;
  return Math.round(usd * Number(usdJpy || DEFAULT_USD_JPY) * 1e6);
}
