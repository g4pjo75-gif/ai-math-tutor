// NOTE: Phase 7-6-2B-1B에서 root tailwind.config.cjs로 통합됨 (shared/tailwind.css 빌드에 사용)
// tailwind play CDN config (legacy)
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          english: {
            dark: '#0f172a',
            mid: '#1e3a5f',
            light: '#2563eb'
          }
        }
      }
    }
  };
}
