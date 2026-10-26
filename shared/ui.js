// shared/ui.js
// Common UI helpers: Toast notifications, modals, dark mode, safe-area management
(function (window) {
  'use strict';

  let toastTimer = null;

  function showToast(text, color = 'blue', durationMs = 2500) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      document.body.appendChild(toast);
    }

    const styles = {
      blue: 'bg-slate-900/95 text-white border-emerald-500/60 dark:bg-slate-800 dark:text-slate-100',
      amber: 'bg-amber-600/95 text-white border-amber-300',
      red: 'bg-red-600/95 text-white border-red-300',
      green: 'bg-emerald-700/95 text-white border-emerald-300'
    };

    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-md px-4 py-3 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold transition-all duration-300 ${
      styles[color] || styles.blue
    }`;
    toast.textContent = text;
    toast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toastTimer = null;
    }, durationMs);
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    if (el.style.display === 'none') {
      el.style.display = 'flex';
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.display = 'none';
  }

  function bindBackdropClose(modalId, contentContainerId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (contentContainerId) {
        const content = document.getElementById(contentContainerId);
        if (content && !content.contains(e.target)) {
          closeModal(modalId);
        }
      } else if (e.target === modal) {
        closeModal(modalId);
      }
    });
  }

  function initDarkMode({ storage, key = 'dark_mode', toggleBtnId = 'darkModeToggle' } = {}) {
    const saved = storage ? storage.getItem(key) : null;
    const html = document.documentElement;
    const btn = document.getElementById(toggleBtnId);

    const isDark =
      saved === '1' ||
      (saved === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      html.classList.add('dark');
      if (btn) btn.textContent = '☀️';
    } else {
      html.classList.remove('dark');
      if (btn) btn.textContent = '🌙';
    }
    return isDark;
  }

  function toggleDarkMode({ storage, key = 'dark_mode', toggleBtnId = 'darkModeToggle' } = {}) {
    const html = document.documentElement;
    const isDark = html.classList.toggle('dark');
    if (storage) {
      storage.setItem(key, isDark ? '1' : '0');
    }
    const btn = document.getElementById(toggleBtnId);
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    return isDark;
  }

  function updateSafeArea() {
    const kbHeight = Math.max(
      0,
      window.innerHeight - (window.visualViewport?.height || window.innerHeight)
    );
    document.documentElement.style.setProperty('--keyboard-height', `${kbHeight}px`);
  }

  window.TutorUI = {
    showToast,
    openModal,
    closeModal,
    bindBackdropClose,
    initDarkMode,
    toggleDarkMode,
    updateSafeArea
  };
})(window);
