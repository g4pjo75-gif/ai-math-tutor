import test from 'node:test';
import assert from 'node:assert/strict';
import { limitMathProblems, MAX_MATH_PROBLEMS } from '../src/problem-limit.js';

test('limitMathProblems: 3건 → 2건 + has_more_problems: true', () => {
  const data = {
    problems: [{ id: 1 }, { id: 2 }, { id: 3 }]
  };
  const limited = limitMathProblems(data);
  assert.equal(limited.problems.length, MAX_MATH_PROBLEMS);
  assert.deepEqual(limited.problems, [{ id: 1 }, { id: 2 }]);
  assert.equal(limited.has_more_problems, true);
});

test('limitMathProblems: 2건 → 유지 + false', () => {
  const data = {
    problems: [{ id: 1 }, { id: 2 }]
  };
  const limited = limitMathProblems(data);
  assert.equal(limited.problems.length, 2);
  assert.equal(limited.has_more_problems, false);
});

test('limitMathProblems: 기존 true 유지 (2건 이하라도 true 유지)', () => {
  const data = {
    problems: [{ id: 1 }],
    has_more_problems: true
  };
  const limited = limitMathProblems(data);
  assert.equal(limited.problems.length, 1);
  assert.equal(limited.has_more_problems, true);
});

test('limitMathProblems: problems 없음 / non-object → 그대로', () => {
  assert.equal(limitMathProblems(null), null);
  assert.equal(limitMathProblems('string'), 'string');
  assert.deepEqual(limitMathProblems([]), []);
  const other = { title: 'No problems array' };
  assert.deepEqual(limitMathProblems(other), other);
});
