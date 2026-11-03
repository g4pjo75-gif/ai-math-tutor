// site/config.js — 사이트 공통 API base 결정
(function () {
  var PROD_API_BASE = 'https://ai-math-tutor-api.g4pjo75.workers.dev';
  var STAGING_API_BASE = 'https://ai-math-tutor-api-staging.g4pjo75.workers.dev';

  var STAGING_HOSTS = {
    'localhost': true,
    '127.0.0.1': true,
    'staging-site-host': true,
    '<staging-site-host>': true
  };

  function resolveApiBase(hostname) {
    var h = String(hostname || '').toLowerCase();
    return (STAGING_HOSTS[h] || h.endsWith('.pages.dev'))
      ? STAGING_API_BASE
      : PROD_API_BASE;
  }

  window.API_BASE = resolveApiBase(window.location && window.location.hostname);
})();
