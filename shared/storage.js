// shared/storage.js
// Safe storage factory with prefix and legacy fallback support
(function (window) {
  'use strict';

  window.TutorStorage = {
    create({ prefix = 'tutor_', legacyPrefixes = [] } = {}) {
      const memory = {};
      const candidates = (key) => {
        const list = [`${prefix}${key}`];
        for (const p of legacyPrefixes) {
          list.push(`${p}${key}`);
        }
        if (!list.includes(key)) {
          list.push(key);
        }
        return list;
      };

      return {
        getItem(key) {
          for (const k of candidates(key)) {
            try {
              const v = localStorage.getItem(k);
              if (v !== null && v !== undefined) return v;
            } catch (e) {}
            if (k in memory) return memory[k];
          }
          return null;
        },
        setItem(key, value) {
          const k = `${prefix}${key}`;
          const strVal = String(value);
          memory[k] = strVal;
          try {
            localStorage.setItem(k, strVal);
            return true;
          } catch (e) {
            console.warn('localStorage.setItem failed:', e);
            return false;
          }
        },
        removeItem(key) {
          const k = `${prefix}${key}`;
          delete memory[k];
          try {
            localStorage.removeItem(k);
          } catch (e) {}
          for (const legacy of legacyPrefixes) {
            try {
              localStorage.removeItem(`${legacy}${key}`);
            } catch (e) {}
          }
        }
      };
    }
  };
})(window);
