export const MAX_MATH_PROBLEMS = 2;

export function limitMathProblems(data, max = MAX_MATH_PROBLEMS) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (!Array.isArray(data.problems)) return data;

  const hasMore = data.problems.length > max || data.has_more_problems === true;
  return {
    ...data,
    problems: data.problems.slice(0, max),
    has_more_problems: hasMore
  };
}
