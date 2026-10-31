    function renderNumberlineSvg(svg, visual) {
      const nl = visual.numberline || {};
      const min = clampVal(nl.min, -50, 50, -5);
      const max = clampVal(nl.max, -50, 50, 5);

      const width = 360;
      const centerY = 120;
      const pad = 30;
      const toSvgX = (v) => pad + ((v - min) / (max - min || 1)) * (width - 2 * pad);

      // 数直線の軸
      const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      axis.setAttribute('x1', pad - 10);
      axis.setAttribute('y1', centerY);
      axis.setAttribute('x2', width - pad + 10);
      axis.setAttribute('y2', centerY);
      axis.setAttribute('class', 'viz-axis');
      svg.appendChild(axis);

      // 目盛り
      for (let v = Math.ceil(min); v <= Math.floor(max); v++) {
        const sx = toSvgX(v);
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', sx);
        tick.setAttribute('y1', centerY - 4);
        tick.setAttribute('x2', sx);
        tick.setAttribute('y2', centerY + 4);
        tick.setAttribute('class', 'viz-axis');
        svg.appendChild(tick);

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', sx - 3);
        lbl.setAttribute('y', centerY + 18);
        lbl.setAttribute('class', 'viz-text');
        lbl.textContent = String(v);
        svg.appendChild(lbl);
      }

      // 区間 (intervals)
      if (Array.isArray(nl.intervals)) {
        nl.intervals.forEach(iv => {
          const fromX = toSvgX(iv.from);
          const toX = toSvgX(iv.to);
          const topY = centerY - 30;

          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          poly.setAttribute('points', `${fromX},${centerY} ${fromX},${topY} ${toX},${topY} ${toX},${centerY}`);
          poly.setAttribute('class', 'fill-none stroke-emerald-600 dark:stroke-emerald-400 stroke-2');
          svg.appendChild(poly);

          // 端点
          const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c1.setAttribute('cx', fromX);
          c1.setAttribute('cy', centerY);
          c1.setAttribute('r', '4');
          c1.setAttribute('class', iv.left_closed ? 'fill-emerald-600' : 'fill-white stroke-emerald-600 stroke-2');
          svg.appendChild(c1);

          const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c2.setAttribute('cx', toX);
          c2.setAttribute('cy', centerY);
          c2.setAttribute('r', '4');
          c2.setAttribute('class', iv.right_closed ? 'fill-emerald-600' : 'fill-white stroke-emerald-600 stroke-2');
          svg.appendChild(c2);
        });
      }

      // 単独マーク (marks)
      if (Array.isArray(nl.marks)) {
        nl.marks.filter(Boolean).forEach(m => {
          const mx = toSvgX(m.value);
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', mx);
          circle.setAttribute('cy', centerY);
          circle.setAttribute('r', '4.5');
          circle.setAttribute('class', m.closed ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-white stroke-emerald-600 stroke-2');
          svg.appendChild(circle);

          if (m.label) {
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', mx);
            txt.setAttribute('y', centerY - 10);
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('class', 'viz-text font-bold fill-slate-800 dark:fill-slate-200');
            txt.textContent = m.label;
            svg.appendChild(txt);
          }
        });
      }
    }

