import { TutorUI } from '../shared/ui.js';
import { safeStorage } from './state.js';

    // =========================================================================
    // 0. モバイルUI/UX ユーティリティ（ダークモード、アップロード進捗バー、セクション遷移）
    // =========================================================================
export function toggleDarkMode() {
      const html = document.documentElement;
      const isDark = html.classList.toggle('dark');
      safeStorage.setItem('dark_mode', isDark ? '1' : '0');
      const btn = document.getElementById('darkModeToggle');
      if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    }

export function initDarkMode() {
      const saved = safeStorage.getItem('dark_mode');
      const html = document.documentElement;
      const btn = document.getElementById('darkModeToggle');
      if (saved === '1' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
        if (btn) btn.textContent = '☀️';
      } else {
        html.classList.remove('dark');
        if (btn) btn.textContent = '🌙';
      }
    }

export function changeTheme(theme) {
      if (TutorUI && typeof TutorUI.applyTheme === 'function') {
        TutorUI.applyTheme(theme, { storage: safeStorage, key: 'ui_theme' });
      } else {
        document.documentElement.setAttribute('data-theme', theme);
        safeStorage.setItem('ui_theme', theme);
        ['minimal', 'edutech', 'mobile'].forEach(t => {
          const btn = document.getElementById('btn-' + t);
          if (btn) btn.classList.toggle('active', t === theme);
        });
      }
    }

export function initTheme() {
      if (TutorUI && typeof TutorUI.initTheme === 'function') {
        TutorUI.initTheme({ storage: safeStorage, key: 'ui_theme' });
      } else {
        const savedTheme = safeStorage.getItem('ui_theme') || 'minimal';
        changeTheme(savedTheme);
      }
    }

    // セイフエリア・仮想キーボード高さの更新（iOSノッチを上書きしない）
export function updateSafeArea() {
      const kbHeight = Math.max(0, window.innerHeight - (window.visualViewport?.height || window.innerHeight));
      document.documentElement.style.setProperty('--keyboard-height', `${kbHeight}px`);
    }

    // =========================================================================
