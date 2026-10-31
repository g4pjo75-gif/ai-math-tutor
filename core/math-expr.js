// core/math-expr.js — 수식 정규화 · 동치 판정 (DOM 비의존, API 0회)

export function normalizeMathExpr(input) {
  if (input === null || input === undefined) return '';
  let s = String(input);

  // 1. 전각 영숫자·기호를 반각으로
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s
    .replace(/　/g, ' ')
    .replace(/[−ー―‐–—]/g, '-')
    .replace(/[＋]/g, '+')
    .replace(/[×⋅・]/g, '*')
    .replace(/[÷／]/g, '/')
    .replace(/[＝]/g, '=')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[，、]/g, ',')
    .replace(/[．。]/g, '');

  // 2. LaTeX 구분자·장식 명령 제거
  s = s
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
    .replace(/\\left|\\right|\\displaystyle|\\,/g, '')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\\\/g, '\\');

  // 3. 부등호·복호·분수·근호 정규화
  s = s
    .replace(/\\leqq|\\leq|\\le|≦|≤|=<|<=/g, '<=')
    .replace(/\\geqq|\\geq|\\ge|≧|≥|=>|>=/g, '>=')
    .replace(/\\pm|±/g, '+-')
    .replace(/\\times|\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');

  // 4. 공백 제거
  s = s.replace(/\s+/g, '');

  // 5. 선두의 「답:」「答え:」 등 제거
  s = s.replace(/^(答え?|解答|ans|answer)[:：=]/i, '');

  // 6. 단일 분수의 불필요한 바깥 괄호 제거
  s = s.replace(/\(([0-9a-zA-Z]+)\)\/\(([0-9a-zA-Z]+)\)/g, '$1/$2');

  // 7. 인수분해 곱의 순서 정규화
  const factorMatch = s.match(/^([+-]?[0-9a-zA-Z]*)((?:\([^()]+\)){2,})$/);
  if (factorMatch) {
    const prefix = factorMatch[1] === '+' ? '' : factorMatch[1];
    const factors = [...factorMatch[2].matchAll(/\([^()]+\)/g)].map(m => m[0]);
    if (factors.length >= 2) {
      factors.sort();
      s = prefix + factors.join('');
    }
  }

  return s;
}

export function isLocalMathMatch(studentRaw, referenceList = []) {
  const stuNorm = normalizeMathExpr(studentRaw);
  if (!stuNorm) return false;

  const normalizeSolutionSet = (normStr) => {
    const withoutVar = normStr.replace(/^[a-zA-Z]=/, '');
    if (withoutVar.includes(',') && !withoutVar.includes('(')) {
      return withoutVar.split(',').map(p => p.trim()).filter(Boolean).sort().join(',');
    }
    return withoutVar;
  };

  const flipDoubleInequality = (normStr) => {
    const m = normStr.match(/^([^<>]+)(>=|>)([^<>]+)(>=|>)(.+)$/);
    if (m) {
      const op1 = m[4] === '>=' ? '<=' : '<';
      const op2 = m[2] === '>=' ? '<=' : '<';
      return `${m[5]}${op1}${m[3]}${op2}${m[1]}`;
    }
    return normStr;
  };

  const stuFlipped = flipDoubleInequality(stuNorm);
  const stuSet = normalizeSolutionSet(stuNorm);

  const refs = (Array.isArray(referenceList) ? referenceList : [referenceList]).filter(Boolean);
  for (const ref of refs) {
    const refNorm = normalizeMathExpr(ref);
    if (!refNorm) continue;

    if (stuNorm === refNorm || stuFlipped === refNorm) {
      return true;
    }
    const refSet = normalizeSolutionSet(refNorm);
    if (stuSet && refSet && stuSet === refSet) {
      return true;
    }
  }
  return false;
}
