#!/usr/bin/env python3
"""Phase 4-C prototype: shared/*.js -> ESM, remove window.* bridges."""
import re
import sys
import os

SHARED = {
    'storage.js': ('window.TutorStorage', 'TutorStorage'),
    'core.js': ('window.TutorCore', 'TutorCore'),
    'speech.js': ('window.TutorSpeech', 'TutorSpeech'),
    'ui.js': ('window.TutorUI', 'TutorUI'),
}

ACTIONS_HEAD = '''// shared/actions.js — Phase 4-C: 위임 디스패처 (ESM)
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
    .replace(/\\r/g, '')
    .replace(/\\n/g, '&#10;');
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
'''


def convert_shared(path, target, name):
    src = open(path, encoding='utf-8').read()
    lines = src.split('\n')
    # drop the IIFE header (first non-comment line starting with "(function")
    out = []
    header_done = False
    for line in lines:
        if not header_done and line.startswith('(function'):
            header_done = True
            continue
        out.append(line)
    src = '\n'.join(out)
    src = re.sub(r'\}\)\(window\);\s*$', '', src)
    src = src.replace('window.%s = {' % name, 'export const %s = {' % name, 1)
    open(path, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n')


def convert_actions(path):
    open(path, 'w', encoding='utf-8').write(ACTIONS_HEAD)


def main(root):
    shared = os.path.join(root, 'shared')
    for fname, (_old, name) in SHARED.items():
        convert_shared(os.path.join(shared, fname), None, name)
        print('shared/%s -> export const %s' % (fname, name))
    convert_actions(os.path.join(shared, 'actions.js'))
    print('shared/actions.js -> named exports')

    for app in ['math', 'english']:
        d = os.path.join(root, app)
        for f in sorted(os.listdir(d)):
            if not f.endswith('.js'):
                continue
            p = os.path.join(d, f)
            src = open(p, encoding='utf-8').read()
            orig = src
            imports = []
            for fname, (old, name) in SHARED.items():
                if old in src:
                    src = src.replace(old, name)
                    imports.append("import { %s } from '../shared/%s';" % (name, fname))
            if 'escapeAttr(' in src and 'escapeAttr' not in ''.join(imports):
                imports.append("import { escapeAttr } from '../shared/actions.js';")
            if 'TutorActions.register(' in src:
                src = src.replace('TutorActions.register(', 'register(')
                imports.append("import { register } from '../shared/actions.js';")
            if imports:
                src = '\n'.join(imports) + '\n' + src
            if src != orig:
                open(p, 'w', encoding='utf-8').write(src)
        print(app, 'patched')


if __name__ == '__main__':
    main(sys.argv[1])
