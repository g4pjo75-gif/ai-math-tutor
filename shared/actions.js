// shared/actions.js — Phase 4-A: 인라인 핸들러 위임 디스패처 (classic script)
(function (global) {
  'use strict';

  var registry = Object.create(null);

  function register(map) {
    Object.keys(map).forEach(function (name) {
      if (registry[name]) console.warn('[actions] duplicate action:', name);
      registry[name] = map[name];
    });
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r/g, '')
      .replace(/\n/g, '&#10;'); // 원본 escapeJsString과 동일하게 개행 보존
  }

  function run(name, el, event) {
    var fn = registry[name];
    if (!fn) { console.warn('[actions] unregistered:', name); return; }
    try { fn(el, event); } catch (err) { console.error('[actions] failed:', name, err); }
  }

  function closest(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  document.addEventListener('click', function (event) {
    var el = closest(event.target, '[data-action]');
    if (el) run(el.dataset.action, el, event);
  });

  document.addEventListener('change', function (event) {
    var el = closest(event.target, '[data-change]');
    if (el) run(el.dataset.change, el, event);
  });

  document.addEventListener('input', function (event) {
    var el = closest(event.target, '[data-input]');
    if (el) run(el.dataset.input, el, event);
  });

  document.addEventListener('keydown', function (event) {
    // 원본 인라인 조건과 완전히 동일하게 유지한다.
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    var el = closest(event.target, '[data-enter]');
    if (el) run(el.dataset.enter, el, event);
  });

  global.TutorActions = {
    register: register,
    escapeAttr: escapeAttr,
    run: run,
    audit: function () {
      var nodes = document.querySelectorAll('[data-action],[data-change],[data-input],[data-enter]');
      var missing = [];
      Array.prototype.forEach.call(nodes, function (el) {
        var name = el.dataset.action || el.dataset.change || el.dataset.input || el.dataset.enter;
        if (!registry[name]) missing.push(name);
      });
      return { nodes: nodes.length, actions: Object.keys(registry).length, missing: missing };
    }
  };
  global.escapeAttr = escapeAttr; // Phase 4-B에서 export로 대체
})(window);
