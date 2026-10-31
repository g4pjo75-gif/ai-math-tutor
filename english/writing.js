import { callGeminiModel, computeRequestHash, getCachedResponse, setCachedResponse } from '../core/index.js';
import { TutorUI } from '../shared/ui.js';
import { escapeAttr } from '../shared/actions.js';
import { engStore, state } from './state.js';
import { WRITING_CORRECTION_SCHEMA } from './schema.js';
import { getActiveModel, getApiKey, openSettings } from './init.js';
import { hideStatus, showStatus } from './mode.js';
import { escapeHtml } from './voice.js';

    // =========================================================================
    // 7. 英作文 AI添削モード (Writing Correction Mode)
    // =========================================================================
export function updateWordCount() {
      const text = (document.getElementById('writingStudentInput')?.value || '').trim();
      const words = text ? text.split(/\s+/).length : 0;
      const el = document.getElementById('writingWordCount');
      if (el) el.textContent = `${words} word${words === 1 ? '' : 's'}`;
    }

export async function generateWritingPrompt() {
      const apiKey = getApiKey();
      if (!apiKey) {
        openSettings();
        TutorUI.showToast('🔑 先に設定からGemini APIキーを入力してください。', 'amber');
        return;
      }

      const unitHint = document.getElementById('unitSelect').value;
      const modelId = getActiveModel();
      const btn = document.getElementById('genPromptBtn');
      if (btn) btn.disabled = true;

      try {
        const res = await callGeminiModel({
          modelId,
          apiKey,
          promptText: `日本の高校1年生が英作文の練習をするための和文課題を1つ作成してください。
【単元テーマ】: ${unitHint}
1行目に課題の日本語文、2行目に「ヒント: 使える英単語2〜3個」のみを簡潔に出力してください。`,
          rawText: true,
          temperature: 0.7,
          timeoutMs: 20000
        });

        const lines = res.split(/\n+/).map(l => l.trim()).filter(Boolean);
        document.getElementById('writingTaskInput').value = (lines[0] || res).replace(/^(課題|和文|問題)[:：]\s*/, '');
        const hintEl = document.getElementById('writingTaskHint');
        if (lines[1] && hintEl) {
          hintEl.textContent = `💡 ${lines.slice(1).join(' / ')}`;
          hintEl.classList.remove('hidden');
        }
        TutorUI.showToast('🎲 練習課題を作成しました！英文を書いてみましょう。', 'blue');
      } catch (e) {
        TutorUI.showToast('❌ 課題の作成に失敗しました。', 'red');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

export async function submitWritingForCorrection() {
      const studentText = (document.getElementById('writingStudentInput')?.value || '').trim();
      if (!studentText) {
        TutorUI.showToast('⚠️ 添削するあなたの英文を入力してください。', 'amber');
        return;
      }

      const taskJa = (document.getElementById('writingTaskInput')?.value || '').trim();
      const unitHint = document.getElementById('unitSelect').value;

      // ④ 同一英作文の重複API呼び出し防止キャッシュ
      const reqFp = computeRequestHash({
            mode: 'eng_writing',
            unit: `${unitHint}|${taskJa}`,
            text: studentText
          });

      if (reqFp && engStore) {
        const cachedData = getCachedResponse(engStore, 'api_cache', reqFp);
        if (cachedData) {
          state.lastWritingData = cachedData;
          hideStatus();
          renderWritingCorrection(state.lastWritingData);
          TutorUI.showToast('⚡ 同じ英作文の添削記録が見つかったため、APIを消費せず即座に表示しました！', 'blue');
          return;
        }
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        openSettings();
        TutorUI.showToast('🔑 先に設定からGemini APIキーを入力してください。', 'amber');
        return;
      }

      const modelId = getActiveModel();
      const btn = document.getElementById('checkWritingBtn');

      if (btn) btn.disabled = true;
      showStatus('⏳ AI英語先生があなたの英作文を丁寧に添削しています…', 'blue');

      const prompt = `あなたは日本の高校生に英作文を指導する優しいAI英語教師です。
生徒が書いた英文を添削し、文法・スペル・語法の修正点と、より自然なネイティブ表現をJSONスキーマで出力してください。
【単元ヒント】: ${unitHint}
【課題の日本語（もしあれば）】: ${taskJa || '自由英作文'}
【生徒の英作文】: ${studentText}`;

      try {
        const data = await callGeminiModel({
          modelId,
          apiKey,
          promptText: prompt,
          schema: WRITING_CORRECTION_SCHEMA,
          temperature: 0.35,
          timeoutMs: 30000
        });

        state.lastWritingData = { ...data, task_ja: taskJa, original_text: data.original_text || studentText };
        if (reqFp && engStore) {
          setCachedResponse(engStore, 'api_cache', reqFp, state.lastWritingData, 15);
        }
        hideStatus();
        renderWritingCorrection(state.lastWritingData);
        TutorUI.showToast('✨ 英作文の添削が完了しました！', 'green');
      } catch (err) {
        console.error(err);
        showStatus(`❌ 添削エラー: ${err.message}`, 'red');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

export function renderWritingCorrection(data) {
      const box = document.getElementById('writingResultSection');
      if (!box) return;

      const fixes = Array.isArray(data.grammar_fixes) ? data.grammar_fixes : [];
      const fixesHtml = fixes.length > 0
        ? fixes.map(f => `
          <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-serif">
              <span class="line-through text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded">${escapeHtml(f.before)}</span>
              <span>➔</span>
              <span class="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">${escapeHtml(f.after)}</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300">💡 ${escapeHtml(f.reason_ja)}</p>
          </div>
        `).join('')
        : '<p class="text-xs text-emerald-700 dark:text-emerald-300 font-bold">🎉 文法・語法のミスはありません！完璧な英文です！</p>';

      box.innerHTML = `
        <div class="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/70 border-2 border-blue-200 dark:border-blue-900/60 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-700">
            <div class="flex items-center gap-2">
              <span class="text-2xl">🏆</span>
              <div>
                <div class="text-xs text-slate-500 dark:text-slate-400 font-bold">AI添削スコア</div>
                <div class="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">${Number(data.score || 90)} <span class="text-xs font-normal">/ 100点</span></div>
              </div>
            </div>
            <button data-action="save-writing-history" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">
              📁 添削結果をマイノートに保存
            </button>
          </div>

          <!-- Corrected Sentence -->
          <div class="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-900 dark:text-emerald-200">✅ 添削後の正しい英文 (Corrected)</span>
              <button data-action="speak-en" data-text="${escapeAttr(data.corrected_text || '')}" class="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-bold">🔊 発音を聞く</button>
            </div>
            <p class="text-base sm:text-lg font-serif font-bold text-emerald-950 dark:text-emerald-100">${escapeHtml(data.corrected_text || '')}</p>
            ${data.translation_ja ? `<p class="text-xs text-slate-600 dark:text-slate-300">意味: ${escapeHtml(data.translation_ja)}</p>` : ''}
          </div>

          <!-- Native Alternative -->
          ${data.natural_alternative ? `
          <div class="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-900 dark:text-blue-200">🌟 さらに自然なネイティブ表現 (Level Up!)</span>
              <button data-action="speak-en" data-text="${escapeAttr(data.natural_alternative)}" class="text-xs text-blue-600 dark:text-blue-400 font-bold">🔊 発音</button>
            </div>
            <p class="text-sm font-serif font-bold text-slate-900 dark:text-white">${escapeHtml(data.natural_alternative)}</p>
          </div>` : ''}

          <!-- Detailed Fixes -->
          <div class="space-y-2">
            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">🔍 修正ポイントの解説</div>
            <div class="space-y-2">${fixesHtml}</div>
          </div>

          <!-- Teacher's Comment -->
          <div class="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
            <span class="font-bold">👨‍🏫 先生からのアドバイス：</span> ${escapeHtml(data.praise_and_advice || '')}
          </div>
        </div>
      `;
      box.classList.remove('hidden');
    }

