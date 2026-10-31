import { register } from '../shared/actions.js';
import { changeTheme, toggleDarkMode } from './theme-ui.js';
import { closeTutorHistoryModal, deleteFromTutorHistory, restoreFromHistory, saveCurrentToTutorHistory, showTutorHistory } from './history.js';
import { generateSimilarProblem } from './similar.js';
import { insertMathSymbol, selectQuizChoice, setQuizInputMode, startQuizChallenge, submitChoiceAnswer } from './quiz.js';
import { closeQuizSection, saveQuizToHistory, showQuizFullSolution, submitStudentAnswer, toggleQuizHint } from './quiz-result.js';
import { unlockApp } from './init.js';
import { closeSettings, fetchAvailableModels, onModelDropdownChange, openSettings, saveSettings } from './settings.js';
import { clearImage, handleImageUpload } from './upload.js';
import { solveProblem } from './api-solve.js';
import { simplifyStep } from './simplify.js';
import { onSpeechRateChange, onVoiceChange, playAllSteps, playSingleStep, speakJapanese, stopSpeech, testVoice } from './voice.js';
import { openStepChatWithQuote, sendQuickQuestion, sendStepQuestion, toggleStepChat } from './chat-step.js';
import { sendOverallQuestion, sendOverallQuickQuestion } from './chat-overall.js';
import { toggleStepDetail } from './render.js';

// math/actions-map.js — Phase 4-A: 수학 액션 등록표
register({
  'unlock': () => unlockApp(),
  'open-settings': () => openSettings(),
  'toggle-dark-mode': () => toggleDarkMode(),
  'show-tutor-history': () => showTutorHistory(),
  'change-theme': (el) => changeTheme(el.dataset.theme),
  'model-change': () => onModelDropdownChange(),
  'image-upload': (el, event) => handleImageUpload(event),
  'clear-image': () => clearImage(),
  'solve': (el) => solveProblem(el.dataset.model || null, el.dataset.force === '1'),
  'play-all-steps': () => playAllSteps(),
  'stop-speech': () => stopSpeech(),
  'voice-change': () => onVoiceChange(),
  'test-voice': () => testVoice(),
  'speech-rate-change': () => onSpeechRateChange(),
  'overall-quick': (el) => sendOverallQuickQuestion(el.dataset.text),
  'overall-send': () => sendOverallQuestion(),
  'start-quiz': () => startQuizChallenge(),
  'generate-similar': () => generateSimilarProblem(),
  'save-current-history': () => saveCurrentToTutorHistory(),
  'close-quiz': () => closeQuizSection(),
  'toggle-quiz-hint': () => toggleQuizHint(),
  'quiz-mode': (el) => setQuizInputMode(el.dataset.mode),
  'submit-choice': () => submitChoiceAnswer(),
  'insert-symbol': (el) => insertMathSymbol(el.dataset.symbol),
  'submit-student': () => submitStudentAnswer(),
  'close-settings': () => closeSettings(),
  'fetch-models': () => fetchAvailableModels(),
  'save-settings': () => saveSettings(),
  'close-tutor-history': () => closeTutorHistoryModal(),
  'restore-history': (el) => restoreFromHistory(el.dataset.id),
  'delete-tutor-history': (el) => deleteFromTutorHistory(el.dataset.id),
  'select-choice': (el) => selectQuizChoice(Number(el.dataset.idx)),
  'save-quiz-history': () => saveQuizToHistory(),
  'focus-student-answer': () => document.getElementById('studentAnswerInput')?.focus(),
  'show-full-solution': () => showQuizFullSolution(),
  'play-step': (el) => playSingleStep(Number(el.dataset.idx)),
  'simplify-step': (el) => simplifyStep(Number(el.dataset.idx)),
  'toggle-step-chat': (el) => toggleStepChat(Number(el.dataset.idx)),
  'step-quote': (el) => openStepChatWithQuote(Number(el.dataset.idx), el.dataset.part),
  'quick-question': (el) => sendQuickQuestion(Number(el.dataset.idx), el.dataset.text),
  'step-question-send': (el) => sendStepQuestion(Number(el.dataset.idx)),
  'step-detail': (el) => toggleStepDetail(el),
  'speak-ja': (el) => speakJapanese(el.dataset.text)
});
