// shared/storage.js
// Safe storage factory with prefix and legacy fallback support
  'use strict';

  export const TutorStorage = {
    create({ prefix = 'tutor_', legacyPrefixes = [] } = {}) {
      const memory = {};
      const candidates = (key) => {
        const keys = [key];
        if (key === 'app_pin') keys.push('pin');
        else if (key === 'pin') keys.push('app_pin');

        const list = [];
        for (const base of keys) {
          const pref = `${prefix}${base}`;
          if (!list.includes(pref)) list.push(pref);
          for (const p of legacyPrefixes) {
            const leg = `${p}${base}`;
            if (!list.includes(leg)) list.push(leg);
          }
          if (!list.includes(base)) {
            list.push(base);
          }
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
          if (key === 'app_pin' || key === 'pin') {
            memory[`${prefix}app_pin`] = strVal;
            memory[`${prefix}pin`] = strVal;
          }
          try {
            localStorage.setItem(k, strVal);
            if (key === 'app_pin') {
              try { localStorage.setItem(`${prefix}pin`, strVal); } catch (e) {}
            } else if (key === 'pin') {
              try { localStorage.setItem(`${prefix}app_pin`, strVal); } catch (e) {}
            }
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
