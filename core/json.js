// core/json.js — AI 응답에서 JSON 추출 (DOM 비의존)

export function parseJson(rawText) {
  const cleaned = String(rawText || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('AIの応答からJSONデータを抽出できませんでした。');
  }
  return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
}
