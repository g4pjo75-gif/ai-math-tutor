
    // =========================================================================
    // 2. Gemini 構造化出力スキーマ定義
    // =========================================================================
export const ENGLISH_READING_SCHEMA = {
      type: 'OBJECT',
      properties: {
        passage_en: { type: 'STRING', description: '認識された英文全文または問題文' },
        translation_ja: { type: 'STRING', description: '自然で分かりやすい日本語全訳' },
        sentence_breakdown: {
          type: 'ARRAY',
          description: '1文ごとの構文(SVOC)・スラッシュリーディング解説',
          items: {
            type: 'OBJECT',
            properties: {
              en: { type: 'STRING' },
              ja: { type: 'STRING' },
              structure_note: { type: 'STRING' }
            },
            required: ['en', 'ja']
          }
        },
        vocabulary: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              word: { type: 'STRING' },
              meaning: { type: 'STRING' },
              example: { type: 'STRING' }
            },
            required: ['word', 'meaning']
          }
        },
        grammar_points: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              explanation: { type: 'STRING' }
            },
            required: ['title', 'explanation']
          }
        },
        quick_check: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            answer: { type: 'STRING' }
          }
        },
        twin_quiz: {
          type: 'OBJECT',
          description: '本文の文法・語彙を確認する4択の類題（ワンショット事前生成）',
          properties: {
            target_point: { type: 'STRING' },
            question_en: { type: 'STRING' },
            translation_ja: { type: 'STRING' },
            hint: { type: 'STRING' },
            choices: { type: 'ARRAY', items: { type: 'STRING' } },
            correct_index: { type: 'INTEGER' },
            choice_feedback: { type: 'ARRAY', items: { type: 'STRING' } },
            explanation: { type: 'STRING' }
          },
          required: ['question_en', 'translation_ja', 'choices', 'correct_index', 'choice_feedback', 'explanation']
        }
      },
      required: ['passage_en', 'translation_ja', 'twin_quiz']
    };

export const ENGLISH_QUIZ_SCHEMA = {
      type: 'OBJECT',
      properties: {
        target_point: { type: 'STRING', description: '出題単元・文法ポイント名' },
        question_en: { type: 'STRING', description: '英語の4択問題文（空所補充など）' },
        translation_ja: { type: 'STRING', description: '問題文の日本語訳' },
        hint: { type: 'STRING', description: '解くための着眼点ヒント（答えは言わない）' },
        choices: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '必ず4つの異なる選択肢'
        },
        correct_index: { type: 'INTEGER', description: '正解のインデックス (0〜3)' },
        choice_feedback: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: '各選択肢(0〜3)がなぜ正解/不正解なのかの解説'
        },
        explanation: { type: 'STRING', description: '全体のまとめ解説' }
      },
      required: ['question_en', 'translation_ja', 'choices', 'correct_index', 'choice_feedback', 'explanation']
    };

export const WRITING_CORRECTION_SCHEMA = {
      type: 'OBJECT',
      properties: {
        score: { type: 'INTEGER', description: '100点満点の評価スコア' },
        original_text: { type: 'STRING', description: '生徒が入力した元の英文' },
        corrected_text: { type: 'STRING', description: '文法・語法を正しく直した自然な英文' },
        natural_alternative: { type: 'STRING', description: 'さらにネイティブらしい別表現' },
        translation_ja: { type: 'STRING', description: '添削後の英文の日本語訳' },
        grammar_fixes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              before: { type: 'STRING' },
              after: { type: 'STRING' },
              reason_ja: { type: 'STRING' }
            },
            required: ['before', 'after', 'reason_ja']
          }
        },
        praise_and_advice: { type: 'STRING', description: '生徒を褒めつつ伸ばす温かいアドバイス' }
      },
      required: ['score', 'corrected_text', 'grammar_fixes', 'praise_and_advice']
    };
