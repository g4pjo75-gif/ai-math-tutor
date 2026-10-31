import re
import os
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
STAGE = sys.argv[2] if len(sys.argv) > 2 else 'all'   # math | english | all


def read(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()


def write(p, s):
    open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)


# ============================================================== MATH
if STAGE in ('math', 'all'):
    # ---------------------------------------------------------------- api-solve.js
    p = 'math/api-solve.js'
    s = read(p)
    s = s.replace("import { TutorCore } from '../shared/core.js';",
                  "import { callGeminiModel, computeRequestHash, getCachedResponse, setCachedResponse, normalizeMathExpr } from '../core/index.js';")

    start = s.index('export async function fetchWithTimeout')
    end = s.index('export async function solveProblem')
    s = s[:start] + s[end:]

    s = s.replace("""      const reqFp = TutorCore
        ? TutorCore.computeRequestHash({""", """      const reqFp = computeRequestHash({""")
    s = s.replace("""            imageBase64: state.currentImageBase64
          })
        : null;""", """            imageBase64: state.currentImageBase64
          });""")
    s = s.replace("""        let cachedData = reqFp && TutorCore
          ? TutorCore.getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;""", """        let cachedData = reqFp
          ? getCachedResponse(safeStorage, 'api_response_cache', reqFp)
          : null;""")
    s = s.replace("if (!cachedData && !state.currentImageBase64 && userText && TutorCore && Array.isArray(state.tutorHistory)) {",
                  "if (!cachedData && !state.currentImageBase64 && userText && Array.isArray(state.tutorHistory)) {")
    s = s.replace("item => item && TutorCore.normalizeMathExpr(item.recognized_problem) === normInput",
                  "item => item && normalizeMathExpr(item.recognized_problem) === normInput")
    s = s.replace("const normInput = TutorCore.normalizeMathExpr(userText);",
                  "const normInput = normalizeMathExpr(userText);")
    s = s.replace("""          if (reqFp && TutorCore) {
            TutorCore.setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
          }""", """          if (reqFp) {
            setCachedResponse(safeStorage, 'api_response_cache', reqFp, resultData, 15);
          }""")
    s = s.replace("callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64);",
                  "callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA });")
    s = s.replace("callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { timeoutMs: 40000 });",
                  "callGeminiModel(selectedModel, geminiKey, fullPrompt, state.currentImageBase64, { schema: TUTOR_RESPONSE_SCHEMA, timeoutMs: 40000 });")
    assert 'TutorCore' not in s, 'api-solve still has TutorCore'
    write(p, s)

    # ---------------------------------------------------------------- settings.js
    p = 'math/settings.js'
    s = read(p)
    s = s.replace("import { fetchWithTimeout } from './api-solve.js';",
                  "import { fetchAvailableModels as fetchModelsFromApi } from '../core/index.js';")
    start = s.index("        const res = await fetchWithTimeout(")
    end = s.index("        safeStorage.setItem('gemini_api_key', key);")
    s = s[:start] + "        const validModels = await fetchModelsFromApi({ apiKey: key, timeoutMs: 15000 });\n\n" + s[end:]
    write(p, s)

    # ---------------------------------------------------------------- ui-status.js
    p = 'math/ui-status.js'
    s = read(p)
    old = """    // クォータ超過エラーの判定
export function isQuotaError(err) {
      const msg = (err?.message || '').toLowerCase();
      return msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted') ||
        msg.includes('billing') || msg.includes('limit: 0');
    }"""
    assert old in s, 'ui-status anchor'
    s = s.replace(old, '')
    assert 'isQuotaError' not in s
    write(p, s)

    # ---------------------------------------------------------------- math callGeminiModel imports
    for f in ['math/chat-overall.js', 'math/chat-step.js', 'math/quiz.js', 'math/similar.js', 'math/simplify.js']:
        s = read(f)
        s = s.replace("import { callGeminiModel } from './api-solve.js';",
                      "import { callGeminiModel } from '../core/index.js';")
        write(f, s)

    # ---------------------------------------------------------------- quiz-result.js
    p = 'math/quiz-result.js'
    s = read(p)
    s = s.replace("import { TutorCore } from '../shared/core.js';",
                  "import { callGeminiModel, isLocalMathMatch } from '../core/index.js';")
    s = s.replace("import { callGeminiModel, solveProblem } from './api-solve.js';",
                  "import { solveProblem } from './api-solve.js';")
    s = s.replace("if (TutorCore && TutorCore.isLocalMathMatch(", "if (isLocalMathMatch(")
    assert 'TutorCore' not in s, 'quiz-result still has TutorCore'
    write(p, s)

    # ---------------------------------------------------------------- isQuotaError: ui-status -> core
    for f in ['math/api-solve.js', 'math/chat-overall.js', 'math/chat-step.js', 'math/quiz-result.js',
              'math/quiz.js', 'math/similar.js', 'math/simplify.js']:
        s = read(f)

        def strip_ui(m):
            names = [x.strip() for x in m.group(1).split(',') if x.strip() and x.strip() != 'isQuotaError']
            return "import { %s } from './ui-status.js';" % ', '.join(names)

        s2 = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'\./ui-status\.js';", strip_ui, s)
        assert s2 != s, f + ' ui-status import not changed'

        def add_core(m):
            names = [x.strip() for x in m.group(1).split(',') if x.strip()]
            if 'isQuotaError' not in names:
                names.append('isQuotaError')
            return "import { %s } from '../core/index.js';" % ', '.join(names)

        s3 = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'\.\./core/index\.js';", add_core, s2)
        assert s3 != s2, f + ' core import not found'
        write(f, s3)

    print('math migrated')


# ============================================================== ENGLISH
if STAGE in ('english', 'all'):
    for f, names in [
        ('english/quiz.js', ['callGeminiModel']),
        ('english/reading.js', ['callGeminiModel', 'computeRequestHash', 'getCachedResponse', 'setCachedResponse']),
        ('english/writing.js', ['callGeminiModel', 'computeRequestHash', 'getCachedResponse', 'setCachedResponse']),
    ]:
        s = read(f)
        s = s.replace("import { TutorCore } from '../shared/core.js';",
                      "import { %s } from '../core/index.js';" % ', '.join(names))
        s = s.replace("""      const reqFp = TutorCore
        ? TutorCore.computeRequestHash({""", """      const reqFp = computeRequestHash({""")
        s = s.replace("""          })
        : null;""", """          });""")
        s = s.replace("if (reqFp && TutorCore && engStore) {", "if (reqFp && engStore) {")
        for n in names:
            s = s.replace('TutorCore.' + n, n)
        assert 'TutorCore' not in s, f + ' still has TutorCore'
        write(f, s)

    os.remove(os.path.join(ROOT, 'shared/core.js'))

    for app in ['math', 'english']:
        p = f'{app}/sw.js'
        s = read(p)
        s = s.replace("  '../shared/core.js',\n", "")
        write(p, s)

    print('english migrated; shared/core.js removed')
