import { state } from './state.js';
import { clampVal, formatCoordinateNumber, parseFunctionFromText } from './visual.js';

export function renderGraphSvg(svg, visual, stepContext = null) {
      let curves = Array.isArray(visual.curves) ? visual.curves.filter(Boolean) : [];
      if (curves.length === 0) {
        const parsed = parseFunctionFromText(visual.caption || '') ||
                       parseFunctionFromText(stepContext?.content || '') ||
                       parseFunctionFromText(stepContext?.explanation || '') ||
                       parseFunctionFromText(state.currentProblemText || '');
        if (parsed) curves.push(parsed);
      }

      // グラフの代表点（原点、定義域の端点、y切片、頂点など）を収集し表示範囲を自動調整
      const critX = [0];
      const critY = [0];

      curves.forEach(c => {
        const kind = c.kind || 'linear';
        const a = Number(c.a ?? (kind === 'linear' ? 1 : 0));
        const b = Number(c.b ?? 0);
        const cVal = Number(c.c ?? 0);
        const fn = (x) => (kind === 'quadratic' ? a * x * x + b * x + cVal : a * x + b);

        if (c.domain_min !== undefined) {
          critX.push(c.domain_min);
          critY.push(fn(c.domain_min));
        }
        if (c.domain_max !== undefined) {
          critX.push(c.domain_max);
          critY.push(fn(c.domain_max));
        }
        critY.push(fn(0));
        if (kind === 'quadratic' && a !== 0) {
          const vx = -b / (2 * a);
          critX.push(vx);
          critY.push(fn(vx));
        }
      });

      if (Array.isArray(visual.points)) {
        visual.points.filter(Boolean).forEach(p => {
          if (p.x !== undefined) critX.push(Number(p.x));
          if (p.y !== undefined) critY.push(Number(p.y));
        });
      }

      let autoXMin = Math.min(...critX);
      let autoXMax = Math.max(...critX);
      let autoYMin = Math.min(...critY);
      let autoYMax = Math.max(...critY);

      const xSpan = Math.max(2, autoXMax - autoXMin);
      const ySpan = Math.max(2, autoYMax - autoYMin);
      const padX = Math.max(1, Math.ceil(xSpan * 0.25));
      const padY = Math.max(1, Math.ceil(ySpan * 0.25));

      let xMin = autoXMin - padX;
      let xMax = autoXMax + padX;
      let yMin = autoYMin - padY;
      let yMax = autoYMax + padY;

      const view = visual.view || {};
      if (view.x_min !== undefined && view.x_max !== undefined) {
        xMin = Math.min(xMin, clampVal(view.x_min, -50, 50, xMin));
        xMax = Math.max(xMax, clampVal(view.x_max, -50, 50, xMax));
      }
      if (view.y_min !== undefined && view.y_max !== undefined) {
        yMin = Math.min(yMin, clampVal(view.y_min, -50, 50, yMin));
        yMax = Math.max(yMax, clampVal(view.y_max, -50, 50, yMax));
      }

      const width = 360;
      const height = 250;
      const padLeft = 36;
      const padRight = 24;
      const padTop = 22;
      const padBottom = 26;

      const plotWidth = width - padLeft - padRight;
      const plotHeight = height - padTop - padBottom;

      const toSvgX = (x) => padLeft + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
      const toSvgY = (y) => padTop + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

      // 軸の矢印マーカー定義
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);
      }
      let marker = defs.querySelector('#axis-arrow-math');
      if (!marker) {
        marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'axis-arrow-math');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '7');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        const mpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mpath.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
        mpath.setAttribute('class', 'fill-slate-700 dark:fill-slate-300');
        marker.appendChild(mpath);
        defs.appendChild(marker);
      }

      // 1. グリッド線
      const xStep = Math.max(1, Math.round((xMax - xMin) / 8));
      const yStep = Math.max(1, Math.round((yMax - yMin) / 8));

      for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += xStep) {
        const sx = toSvgX(x);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', sx);
        line.setAttribute('y1', padTop);
        line.setAttribute('x2', sx);
        line.setAttribute('y2', padTop + plotHeight);
        line.setAttribute('class', 'viz-grid');
        svg.appendChild(line);
      }
      for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y += yStep) {
        const sy = toSvgY(y);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padLeft);
        line.setAttribute('y1', sy);
        line.setAttribute('x2', padLeft + plotWidth);
        line.setAttribute('y2', sy);
        line.setAttribute('class', 'viz-grid');
        svg.appendChild(line);
      }

      // 2. 座標軸 (x軸, y軸, 原点O) - 教科書・チャート式準拠
      const zeroX = toSvgX(0);
      const zeroY = toSvgY(0);

      // x軸
      if (zeroY >= padTop && zeroY <= padTop + plotHeight) {
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', padLeft - 6);
        xAxis.setAttribute('y1', zeroY);
        xAxis.setAttribute('x2', padLeft + plotWidth + 14);
        xAxis.setAttribute('y2', zeroY);
        xAxis.setAttribute('class', 'viz-axis');
        xAxis.setAttribute('marker-end', 'url(#axis-arrow-math)');
        svg.appendChild(xAxis);

        const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        xLabel.setAttribute('x', padLeft + plotWidth + 16);
        xLabel.setAttribute('y', zeroY + 4);
        xLabel.setAttribute('class', 'viz-text font-bold italic');
        xLabel.textContent = 'x';
        svg.appendChild(xLabel);
      }

      // y軸
      if (zeroX >= padLeft && zeroX <= padLeft + plotWidth) {
        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', zeroX);
        yAxis.setAttribute('y1', padTop + plotHeight + 6);
        yAxis.setAttribute('x2', zeroX);
        yAxis.setAttribute('y2', padTop - 14);
        yAxis.setAttribute('class', 'viz-axis');
        yAxis.setAttribute('marker-end', 'url(#axis-arrow-math)');
        svg.appendChild(yAxis);

        const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yLabel.setAttribute('x', zeroX - 10);
        yLabel.setAttribute('y', padTop - 16);
        yLabel.setAttribute('class', 'viz-text font-bold italic');
        yLabel.textContent = 'y';
        svg.appendChild(yLabel);
      }

      // 原点 O
      if (zeroX >= padLeft && zeroX <= padLeft + plotWidth && zeroY >= padTop && zeroY <= padTop + plotHeight) {
        const oLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        oLabel.setAttribute('x', zeroX - 11);
        oLabel.setAttribute('y', zeroY + 13);
        oLabel.setAttribute('class', 'viz-origin');
        oLabel.textContent = 'O';
        svg.appendChild(oLabel);
      }

      // 3. グラフ曲線・線分描画（実線と点線延長）
      curves.forEach((curve, cIdx) => {
        const kind = curve.kind || 'linear';
        const a = Number(curve.a ?? (kind === 'linear' ? 1 : 0));
        const b = Number(curve.b ?? 0);
        const cVal = Number(curve.c ?? 0);
        const fn = (x) => (kind === 'quadratic' ? a * x * x + b * x + cVal : a * x + b);

        const hasDomain = curve.domain_min !== undefined || curve.domain_max !== undefined;
        const dMin = curve.domain_min !== undefined ? curve.domain_min : xMin;
        const dMax = curve.domain_max !== undefined ? curve.domain_max : xMax;

        // 定義域外の延長線（点線）
        if (hasDomain) {
          const extSteps = 80;
          const extPoints = [];
          for (let i = 0; i <= extSteps; i++) {
            const x = xMin + (i / extSteps) * (xMax - xMin);
            const y = fn(x);
            if (y >= yMin - (yMax - yMin) * 0.2 && y <= yMax + (yMax - yMin) * 0.2) {
              extPoints.push(`${toSvgX(x).toFixed(1)},${toSvgY(y).toFixed(1)}`);
            }
          }
          if (extPoints.length > 1) {
            const extPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            extPath.setAttribute('points', extPoints.join(' '));
            extPath.setAttribute('class', 'viz-curve-ext');
            svg.appendChild(extPath);
          }
        }

        // 定義域内の主要線分（太い実線）
        const domSteps = 60;
        const domPoints = [];
        for (let i = 0; i <= domSteps; i++) {
          const x = dMin + (i / domSteps) * (dMax - dMin);
          const y = fn(x);
          domPoints.push(`${toSvgX(x).toFixed(1)},${toSvgY(y).toFixed(1)}`);
        }
        const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        mainPath.setAttribute('points', domPoints.join(' '));
        mainPath.setAttribute('class', 'viz-curve');
        svg.appendChild(mainPath);

        // 曲線ラベル
        if (curve.label) {
          const midX = (dMin + dMax) / 2;
          const midY = fn(midX);
          const clbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          clbl.setAttribute('x', toSvgX(midX) + 6);
          clbl.setAttribute('y', toSvgY(midY) - 6);
          clbl.setAttribute('class', 'viz-text font-bold text-[10px]');
          clbl.textContent = curve.label;
          svg.appendChild(clbl);
        }

        // 端点と軸への点線補助線・座標値ラベル
        const endpoints = [];
        if (curve.domain_min !== undefined) {
          endpoints.push({ x: curve.domain_min, y: fn(curve.domain_min), closed: curve.domain_min_closed !== false });
        }
        if (curve.domain_max !== undefined) {
          endpoints.push({ x: curve.domain_max, y: fn(curve.domain_max), closed: curve.domain_max_closed !== false });
        }

        const labeledX = new Set();
        const labeledY = new Set();

        endpoints.forEach(ep => {
          const ex = toSvgX(ep.x);
          const ey = toSvgY(ep.y);

          // x軸への垂直補助線
          if (Math.abs(ep.y) > 0.05 && zeroY >= padTop && zeroY <= padTop + plotHeight) {
            const vGuide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vGuide.setAttribute('x1', ex);
            vGuide.setAttribute('y1', ey);
            vGuide.setAttribute('x2', ex);
            vGuide.setAttribute('y2', zeroY);
            vGuide.setAttribute('class', 'viz-guide');
            svg.appendChild(vGuide);
          }

          // y軸への水平補助線
          if (Math.abs(ep.x) > 0.05 && zeroX >= padLeft && zeroX <= padLeft + plotWidth) {
            const hGuide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hGuide.setAttribute('x1', ex);
            hGuide.setAttribute('y1', ey);
            hGuide.setAttribute('x2', zeroX);
            hGuide.setAttribute('y2', ey);
            hGuide.setAttribute('class', 'viz-guide');
            svg.appendChild(hGuide);
          }

          // x軸目盛り数値
          if (Math.abs(ep.x) > 0.05 && !labeledX.has(ep.x)) {
            labeledX.add(ep.x);
            const xNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            xNum.setAttribute('x', ex - 4);
            xNum.setAttribute('y', zeroY >= padTop && zeroY <= padTop + plotHeight ? (ep.y >= 0 ? zeroY + 14 : zeroY - 5) : padTop + plotHeight + 12);
            xNum.setAttribute('class', 'viz-axis-num');
            xNum.textContent = formatCoordinateNumber(ep.x);
            svg.appendChild(xNum);
          }

          // y軸目盛り数値
          if (Math.abs(ep.y) > 0.05 && !labeledY.has(ep.y)) {
            labeledY.add(ep.y);
            const yNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const yLabelX = zeroX >= padLeft && zeroX <= padLeft + plotWidth ? (ep.x >= 0 ? zeroX - 14 : zeroX + 6) : padLeft - 14;
            yNum.setAttribute('x', yLabelX);
            yNum.setAttribute('y', ey + 4);
            yNum.setAttribute('class', 'viz-axis-num');
            yNum.textContent = formatCoordinateNumber(ep.y);
            svg.appendChild(yNum);
          }

          // 端点の丸印（塗りつぶし ● または 白抜き ○）
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', ex);
          dot.setAttribute('cy', ey);
          dot.setAttribute('r', '4.5');
          dot.setAttribute('class', ep.closed ? 'viz-endpoint' : 'viz-endpoint-open');
          svg.appendChild(dot);
        });

        // y切片ラベル
        const yIntercept = fn(0);
        if (!labeledY.has(yIntercept) && Math.abs(yIntercept) > 0.05 && yIntercept >= yMin && yIntercept <= yMax) {
          labeledY.add(yIntercept);
          const sy = toSvgY(yIntercept);
          const yIntNum = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          yIntNum.setAttribute('x', zeroX - 12);
          yIntNum.setAttribute('y', sy + 4);
          yIntNum.setAttribute('class', 'viz-axis-num');
          yIntNum.textContent = formatCoordinateNumber(yIntercept);
          svg.appendChild(yIntNum);

          const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          tick.setAttribute('x1', zeroX - 3);
          tick.setAttribute('y1', sy);
          tick.setAttribute('x2', zeroX + 3);
          tick.setAttribute('y2', sy);
          tick.setAttribute('class', 'viz-axis');
          svg.appendChild(tick);
        }
      });

      // 4. 追加のガイド線（AI指定のguides）
      if (Array.isArray(visual.guides)) {
        visual.guides.filter(Boolean).forEach(g => {
          const guideLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          if (g.orientation === 'vertical') {
            const sx = toSvgX(g.value);
            guideLine.setAttribute('x1', sx);
            guideLine.setAttribute('y1', toSvgY(g.from ?? yMin));
            guideLine.setAttribute('x2', sx);
            guideLine.setAttribute('y2', toSvgY(g.to ?? 0));
          } else {
            const sy = toSvgY(g.value);
            guideLine.setAttribute('x1', toSvgX(g.from ?? xMin));
            guideLine.setAttribute('y1', sy);
            guideLine.setAttribute('x2', toSvgX(g.to ?? 0));
            guideLine.setAttribute('y2', sy);
          }
          guideLine.setAttribute('class', 'viz-guide');
          svg.appendChild(guideLine);
        });
      }

      // 5. 特徴点ラベル (points)
      if (Array.isArray(visual.points)) {
        visual.points.filter(Boolean).forEach(p => {
          const px = toSvgX(p.x);
          const py = toSvgY(p.y);
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', px);
          dot.setAttribute('cy', py);
          dot.setAttribute('r', '3.5');
          dot.setAttribute('class', p.open ? 'viz-endpoint-open' : 'viz-endpoint');
          svg.appendChild(dot);

          if (p.label) {
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', px + 6);
            txt.setAttribute('y', py - 6);
            txt.setAttribute('class', 'viz-text font-bold');
            txt.textContent = p.label;
            svg.appendChild(txt);
          }
        });
      }

      // 6. アノテーションテキスト (annotations)
      if (Array.isArray(visual.annotations)) {
        visual.annotations.forEach(a => {
          const ax = toSvgX(a.x);
          const ay = toSvgY(a.y);
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', ax);
          txt.setAttribute('y', ay);
          txt.setAttribute('class', 'viz-text font-bold fill-amber-700 dark:fill-amber-300');
          txt.textContent = a.text || '';
          svg.appendChild(txt);
        });
      }
    }

