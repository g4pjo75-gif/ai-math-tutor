import { renderGraphSvg } from './visual-graph.js';
import { renderNumberlineSvg } from './visual-numberline.js';

    // =========================================================================
    // 7. 図形・グラフ描画エンジン (Visual SVG Renderer)
    // =========================================================================
export function clampVal(val, min, max, defaultVal = 0) {
      const num = Number(val);
      if (isNaN(num)) return defaultVal;
      return Math.max(min, Math.min(max, num));
    }

export function evalFraction(str) {
      if (!str) return 0;
      const s = String(str).trim();
      if (s.includes('/')) {
        const parts = s.split('/');
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
      }
      return parseFloat(s) || 0;
    }

export function parseFunctionFromText(text) {
      if (!text || typeof text !== 'string') return null;
      const clean = text.replace(/\\mathrm\{|\\text\{|\}/g, '').replace(/\s+/g, ' ');

      // 1. 定義域の抽出 (例: -2 ≦ x ≦ 0, -2 <= x <= 0, 1 < x <= 3)
      let domainMin = undefined;
      let domainMax = undefined;
      let minClosed = true;
      let maxClosed = true;

      const domainRegex = /([−\-+]?\s*\d+(?:\/\d+)?(?:\.\d+)?)\s*(<=|≦|\\leqq|\\le|<)\s*x\s*(<=|≦|\\leqq|\\le|<)\s*([−\-+]?\s*\d+(?:\/\d+)?(?:\.\d+)?)/i;
      const dm = clean.match(domainRegex);
      if (dm) {
        domainMin = evalFraction(dm[1].replace(/−/g, '-').replace(/\s+/g, ''));
        domainMax = evalFraction(dm[4].replace(/−/g, '-').replace(/\s+/g, ''));
        minClosed = !dm[2].includes('<') || dm[2].includes('=') || dm[2].includes('le') || dm[2].includes('≦');
        maxClosed = !dm[3].includes('<') || dm[3].includes('=') || dm[3].includes('le') || dm[3].includes('≦');
      }

      // 2. 2次関数: y = ax^2 + bx + c
      const quadRegex = /y\s*=\s*([−\-+]?\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)?)\s*x\^?2\s*([−\-+]\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)?\s*x)?\s*([−\-+]\s*\d+(?:\/\d+)?(?:\.\d+)?)?/i;
      const qm = clean.match(quadRegex);
      if (qm) {
        let aStr = (qm[1] || '').replace(/−/g, '-').replace(/\s+/g, '');
        let a = (aStr === '' || aStr === '+') ? 1 : (aStr === '-' ? -1 : evalFraction(aStr));
        let b = 0;
        if (qm[2]) {
          let bStr = qm[2].replace(/x/i, '').replace(/−/g, '-').replace(/\s+/g, '');
          b = (bStr === '' || bStr === '+') ? 1 : (bStr === '-' ? -1 : evalFraction(bStr));
        }
        let c = qm[3] ? evalFraction(qm[3].replace(/−/g, '-').replace(/\s+/g, '')) : 0;
        return { kind: 'quadratic', a, b, c, domain_min: domainMin, domain_max: domainMax, domain_min_closed: minClosed, domain_max_closed: maxClosed };
      }

      // 3. 1次関数: y = ax + b
      const linearRegex = /y\s*=\s*([−\-+]?\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)?)\s*x\s*([−\-+]\s*\d+(?:\/\d+)?(?:\.\d+)?)?/i;
      const lm = clean.match(linearRegex);
      if (lm) {
        let aStr = (lm[1] || '').replace(/−/g, '-').replace(/\s+/g, '');
        let a = (aStr === '' || aStr === '+') ? 1 : (aStr === '-' ? -1 : evalFraction(aStr));
        let bStr = (lm[2] || '').replace(/−/g, '-').replace(/\s+/g, '');
        let b = bStr ? evalFraction(bStr) : 0;
        return { kind: 'linear', a, b, c: 0, domain_min: domainMin, domain_max: domainMax, domain_min_closed: minClosed, domain_max_closed: maxClosed };
      }

      return null;
    }

export function formatCoordinateNumber(val) {
      if (val === null || val === undefined || isNaN(val)) return '';
      const rounded = Math.round(val);
      if (Math.abs(val - rounded) < 0.01) return String(rounded);
      return String(Number(val.toFixed(2)));
    }

export function renderVisual(container, visual, stepContext = null) {
      if (!container) return;
      if (!visual || typeof visual !== 'object' || !visual.type || visual.type === 'none') {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
      }

      container.classList.remove('hidden');
      container.innerHTML = '';

      const figure = document.createElement('figure');
      figure.className = 'w-full flex flex-col items-center';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 360 250');
      svg.setAttribute('class', 'viz-svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', visual.caption || '数学の図解');

      if (visual.type === 'graph') {
        renderGraphSvg(svg, visual, stepContext);
      } else if (visual.type === 'numberline') {
        renderNumberlineSvg(svg, visual);
      } else {
        container.classList.add('hidden');
        return;
      }

      figure.appendChild(svg);

      if (visual.caption) {
        const captionEl = document.createElement('figcaption');
        captionEl.className = 'text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-2 text-center px-2 leading-relaxed';
        captionEl.textContent = `📊 ${visual.caption}`;
        figure.appendChild(captionEl);
      }

      container.appendChild(figure);
    }

