// shared/actions.js — Phase 4-C: 위임 디스패처 (ESM)
const registry = Object.create(null);

export function register(map) {
  Object.keys(map).forEach((name) => {
    if (registry[name]) console.warn('[actions] duplicate action:', name);
    registry[name] = map[name];
  });
}

export function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r/g, '')
    .replace(/\n/g, '&#10;');
}

export function run(name, el, event) {
  const fn = registry[name];
  if (!fn) { console.warn('[actions] unregistered:', name); return; }
  try { fn(el, event); } catch (err) { console.error('[actions] failed:', name, err); }
}

function closest(target, selector) {
  return target && target.closest ? target.closest(selector) : null;
}

document.addEventListener('click', (event) => {
  const el = closest(event.target, '[data-action]');
  if (el) run(el.dataset.action, el, event);
});

document.addEventListener('change', (event) => {
  const el = closest(event.target, '[data-change]');
  if (el) run(el.dataset.change, el, event);
});

document.addEventListener('input', (event) => {
  const el = closest(event.target, '[data-input]');
  if (el) run(el.dataset.input, el, event);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  const el = closest(event.target, '[data-enter]');
  if (el) run(el.dataset.enter, el, event);
});

export function audit() {
  const nodes = document.querySelectorAll('[data-action],[data-change],[data-input],[data-enter]');
  const missing = [];
  Array.prototype.forEach.call(nodes, (el) => {
    const name = el.dataset.action || el.dataset.change || el.dataset.input || el.dataset.enter;
    if (!registry[name]) missing.push(name);
  });
  return { nodes: nodes.length, actions: Object.keys(registry).length, missing };
}

export const TutorActions = { register, escapeAttr, run, audit };
