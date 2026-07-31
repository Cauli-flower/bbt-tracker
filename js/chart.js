/*
 * chart.js — 手写 SVG 体温曲线（无第三方库）
 * Chart.render(cycle, analysis) -> 返回 SVG 字符串
 *   叠加：覆盖线、排卵日竖线、易孕窗口底色、黄体期(高温相)底色，
 *         以及经期/试纸强阳/蛋清拉丝/同房 标记。
 */
window.Chart = (function () {
  const D = window.DateU;
  const TMIN = 35.5, TMAX = 37.5;
  const SCAN = '#7d6f96';   // 灰紫：监测数据（与 app.css 的 --scan 一致）
  const MED = '#9b8fb5';    // 淡紫：体温受用药影响、不作数的那几天

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // 监测数据：这天有没有记录 / 某侧的长
  function hasScan(d) {
    const s = d && d.scan; if (!s) return false;
    return s.lA != null || s.lB != null || s.rA != null || s.rB != null || s.thick != null || !!s.stage;
  }
  // 左右分开标：两边常常各有一个、迟迟分不出大小，只标「最大的那个」等于没说
  function sizeOf(d, side) {
    const s = d && d.scan; if (!s) return null;
    return s[side + 'A'] != null ? s[side + 'A'] : null;
  }

  const LH_RANK = { negative: 0, faint: 1, medium: 2, near: 3, strong: 4 };

  function render(cycle, a) {
    const days = cycle.days || [];
    const start = cycle.start;
    // 该周期最大天数（至少 30 列，便于阅读）
    let maxCD = 30;
    days.forEach((d) => { maxCD = Math.max(maxCD, D.diffDays(start, d.date) + 1); });

    const col = 26, padL = 34, padR = 12, padT = 16, padB = 132; // padB 含底部 7 行标记
    const plotH = 230;
    const W = padL + padR + maxCD * col;
    const H = padT + plotH + padB;

    const x = (cd) => padL + (cd - 0.5) * col;
    const y = (t) => padT + (TMAX - t) / (TMAX - TMIN) * plotH;

    // 按 cd 索引记录
    const byCD = {};
    days.forEach((d) => { byCD[D.diffDays(start, d.date) + 1] = d; });

    let svg = `<svg id="bbt-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

    // —— 易孕窗口底色（排卵前几天 ~ 排卵日；暖粉色，与高温相明显区分）——
    if (a.fertileWindow) {
      const fs = Math.max(1, D.diffDays(start, a.fertileWindow.start) + 1);
      let fe = D.diffDays(start, a.fertileWindow.end) + 1;
      if (a.ovuCD) fe = Math.min(fe, a.ovuCD); // 视觉上截到排卵日，避免和高温相叠成深块、也避免看着像窗口在排卵后
      const fx0 = x(fs) - col / 2;
      const fx1 = x(Math.min(maxCD, fe)) + col / 2;
      if (fx1 > fx0) {
        svg += `<rect x="${fx0}" y="${padT}" width="${fx1 - fx0}" height="${plotH}" fill="#e8cfc8" opacity="0.55"/>`;
        svg += `<text x="${(fx0 + fx1) / 2}" y="${padT + 12}" font-size="10" fill="#b07f76" text-anchor="middle" font-weight="600">易孕窗口</text>`;
      }
    }

    // —— 高温相底色（排卵升温日到周期末；冷灰绿，与易孕窗口明显区分）——
    if (a.ovuCD) {
      const riseCD = a.ovuCD + 1;
      const hx0 = x(riseCD) - col / 2;
      const hx1 = W - padR;
      if (hx1 > hx0) {
        svg += `<rect x="${hx0}" y="${padT}" width="${hx1 - hx0}" height="${plotH}" fill="#d3e0de" opacity="0.6"/>`;
        svg += `<text x="${(hx0 + hx1) / 2}" y="${padT + 12}" font-size="10" fill="#6f8a86" text-anchor="middle" font-weight="600">高温相</text>`;
      }
    }

    // —— 用药期底色（体温被药托高、不作数的那几天）——
    // 连续的日子并成一段画，中间断开就分成几段，一眼看出「哪一截曲线不能信」
    const offCDs = (cycle.confounded || []).map((ds) => D.diffDays(start, ds) + 1)
      .filter((cd) => cd >= 1 && cd <= maxCD).sort((p, q) => p - q);
    if (offCDs.length) {
      const runs = [];
      offCDs.forEach((cd) => {
        const last = runs[runs.length - 1];
        if (last && cd === last[1] + 1) last[1] = cd; else runs.push([cd, cd]);
      });
      runs.forEach((r) => {
        const rx0 = x(r[0]) - col / 2, rx1 = x(r[1]) + col / 2;
        svg += `<rect x="${rx0}" y="${padT}" width="${rx1 - rx0}" height="${plotH}" fill="${MED}" opacity="0.16"/>`;
        svg += `<line x1="${rx0}" y1="${padT}" x2="${rx0}" y2="${padT + plotH}" stroke="${MED}" stroke-width="1" opacity="0.5"/>`;
        svg += `<line x1="${rx1}" y1="${padT}" x2="${rx1}" y2="${padT + plotH}" stroke="${MED}" stroke-width="1" opacity="0.5"/>`;
        if (r[1] - r[0] >= 2) {
          svg += `<text x="${(rx0 + rx1) / 2}" y="${padT + plotH - 6}" font-size="10" fill="${MED}" text-anchor="middle" font-weight="600">用药·体温不作数</text>`;
        }
      });
    }

    // —— 横向网格线 + 温度标签 ——
    for (let t = 36.0; t <= 37.0 + 1e-6; t += 0.5) {
      const yy = y(t);
      svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#eee" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${yy + 4}" font-size="10" fill="#aaa" text-anchor="end">${t.toFixed(1)}</text>`;
    }

    // —— 竖向天数刻度 + 标签（每天淡线，每 5 天标数字）——
    for (let cd = 1; cd <= maxCD; cd++) {
      const xx = x(cd);
      svg += `<line x1="${xx}" y1="${padT}" x2="${xx}" y2="${padT + plotH}" stroke="#f6f1f3" stroke-width="1"/>`;
      if (cd === 1 || cd % 5 === 0) {
        svg += `<text x="${xx}" y="${padT + plotH + 14}" font-size="10" fill="#bbb" text-anchor="middle">${cd}</text>`;
      }
    }
    svg += `<text x="${padL}" y="${H - 4}" font-size="10" fill="#bbb">周期第几天 →</text>`;

    // —— 覆盖线（已判定排卵时）/ 基线（未判定时画平均值，便于看高于/低于平时）——
    if (a.coverline) {
      const yy = y(a.coverline);
      svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#ad8a86" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      svg += `<text x="${W - padR}" y="${yy - 5}" font-size="10" fill="#ad8a86" text-anchor="end">覆盖线 ${a.coverline.toFixed(2)}</text>`;
    } else {
      // 基线只用「不受用药影响」的点，否则药抬上去的那几天会把基线一起拽高
      const all = a.tempPoints || [];
      const cleanTp = all.filter((p) => !p.off);
      const tp = cleanTp.length >= 3 ? cleanTp : all;
      if (tp.length >= 3) {
        // 基线锚定在「低温相」：取最低的若干天求平均，不把高温相算进去，
        // 这样基线不会随升温往上漂，高温区始终清楚（类似 Apple Watch 固定基线 / BBT 覆盖线的思路）
        const sorted = tp.map((p) => p.temp).sort((a, b) => a - b);
        const k = Math.min(6, sorted.length);
        const baseT = sorted.slice(0, k).reduce((s, t) => s + t, 0) / k;
        const yy = y(baseT);
        svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#bdb5b2" stroke-width="1.3" stroke-dasharray="3 4"/>`;
        svg += `<text x="${W - padR}" y="${yy - 5}" font-size="10" fill="#a89f9c" text-anchor="end">基线 ${baseT.toFixed(2)}</text>`;
      }
    }

    // —— 排卵日竖线 ——
    if (a.ovuCD) {
      const xx = x(a.ovuCD);
      svg += `<line x1="${xx}" y1="${padT}" x2="${xx}" y2="${padT + plotH}" stroke="#8ea1a6" stroke-width="2"/>`;
      svg += `<text x="${xx}" y="${padT - 4}" font-size="10" fill="#5f7174" text-anchor="middle">排卵 ↓</text>`;
    }

    // —— 监测标为「已完成」的那天：紫色竖线（比体温推算更硬的证据，可以对着看差几天）——
    for (let cd = 1; cd <= maxCD; cd++) {
      const d = byCD[cd];
      if (d && d.scan && d.scan.stage === 'done') {
        const xx = x(cd);
        svg += `<line x1="${xx}" y1="${padT}" x2="${xx}" y2="${padT + plotH}" stroke="${SCAN}" stroke-width="1.8" stroke-dasharray="4 3"/>`;
        svg += `<text x="${xx}" y="${padT + plotH - 4}" font-size="9" fill="${SCAN}" text-anchor="middle" font-weight="600">已完成</text>`;
      }
    }

    // —— 体温折线 + 点 ——
    // 受用药影响的那几天单独画成淡紫虚线、空心点，跟能信的那截明确分开
    const pts = a.tempPoints || [];
    if (pts.length) {
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        const dim = p0.off || p1.off;
        svg += `<line x1="${x(p0.cd)}" y1="${y(p0.temp)}" x2="${x(p1.cd)}" y2="${y(p1.temp)}" ` +
          `stroke="${dim ? MED : '#ad8a86'}" stroke-width="2.5" stroke-linecap="round"` +
          `${dim ? ' stroke-dasharray="4 3" opacity="0.75"' : ''}/>`;
      }
      pts.forEach((p) => {
        svg += p.off
          ? `<circle cx="${x(p.cd)}" cy="${y(p.temp)}" r="3.5" fill="#fff" stroke="${MED}" stroke-width="2" stroke-dasharray="2 1.6"/>`
          : `<circle cx="${x(p.cd)}" cy="${y(p.temp)}" r="3.5" fill="#fff" stroke="#ad8a86" stroke-width="2"/>`;
      });
    }

    // —— 底部标记行：每种标记各占一行，避免同一天叠在一起 ——
    const my = padT + plotH + 22;
    const laneH = 14;
    const lane = { period: my, lh: my + laneH, mucus: my + 2 * laneH, sex: my + 3 * laneH, folL: my + 4 * laneH, folR: my + 5 * laneH, note: my + 6 * laneH };
    // 行首小标签，提示每行是什么
    svg += `<text x="${padL - 6}" y="${lane.period + 3}" font-size="9" fill="#c8c0bd" text-anchor="end">经</text>`;
    svg += `<text x="${padL - 6}" y="${lane.folL + 3}" font-size="9" fill="${SCAN}" text-anchor="end">左</text>`;
    svg += `<text x="${padL - 6}" y="${lane.folR + 3}" font-size="9" fill="${SCAN}" text-anchor="end">右</text>`;
    svg += `<text x="${padL - 6}" y="${lane.lh + 3}" font-size="9" fill="#c8c0bd" text-anchor="end">纸</text>`;
    svg += `<text x="${padL - 6}" y="${lane.mucus + 3}" font-size="9" fill="#c8c0bd" text-anchor="end">液</text>`;
    svg += `<text x="${padL - 6}" y="${lane.sex + 3}" font-size="9" fill="#c8c0bd" text-anchor="end">房</text>`;
    svg += `<text x="${padL - 6}" y="${lane.note + 3}" font-size="9" fill="#c8c0bd" text-anchor="end">备</text>`;
    // 试纸深浅阶梯线：把每天档位（阴→强阳）连起来，看深浅怎么爬、哪天跳上去
    const lhBand = 5; // 档位在这一行内上下摆动的幅度（px）
    const lhY = (rank) => lane.lh + lhBand - (rank / 4) * (lhBand * 2);
    const lhPts = [];
    for (let cd = 1; cd <= maxCD; cd++) { const d = byCD[cd]; if (d && d.lh && LH_RANK[d.lh] != null) lhPts.push({ cd, rank: LH_RANK[d.lh], lh: d.lh }); }
    if (lhPts.length >= 2) {
      let lp = '';
      lhPts.forEach((p, i) => { lp += (i ? ' L' : 'M') + x(p.cd) + ' ' + lhY(p.rank); });
      svg += `<path d="${lp}" fill="none" stroke="#8ea1a6" stroke-width="1.3" opacity="0.55" stroke-linejoin="round"/>`;
    }
    for (let cd = 1; cd <= maxCD; cd++) {
      const d = byCD[cd]; if (!d) continue;
      const xx = x(cd);
      if (window.Cycle.isPeriod(d)) {
        // 无排卵出血用空心圈，和真月经（实心）区分
        if (d.breakthrough) svg += `<circle cx="${xx}" cy="${lane.period}" r="4" fill="#fff" stroke="#ad8a86" stroke-width="1.6"/>`;
        else svg += `<circle cx="${xx}" cy="${lane.period}" r="4" fill="#ad8a86"/>`;
      }
      if (d.lh && LH_RANK[d.lh] != null) {
        const yy = lhY(LH_RANK[d.lh]);
        if (d.lh === 'strong') svg += `<polygon points="${xx},${yy - 4} ${xx + 4},${yy + 3} ${xx - 4},${yy + 3}" fill="#8ea1a6"/>`;
        else svg += `<circle cx="${xx}" cy="${yy}" r="2.4" fill="#8ea1a6" opacity="${0.35 + LH_RANK[d.lh] * 0.15}"/>`;
      }
      if (d.mucus === 'eggwhite' || d.mucus === 'slippery') { svg += `<polygon points="${xx},${lane.mucus - 5} ${xx + 5},${lane.mucus} ${xx},${lane.mucus + 5} ${xx - 5},${lane.mucus}" fill="#9aa890"/>`; }
      if (d.intercourse) { svg += `<g transform="translate(${xx - 6} ${lane.sex - 6}) scale(0.5)" fill="#ad8a86"><path d="${window.Icons.P.heartPath}"/></g>`; }
      // 「左/右」行：各标当侧的长 mm，看两边各自怎么变、哪边先跑出来
      ['l', 'r'].forEach((side) => {
        const ln = side === 'l' ? lane.folL : lane.folR;
        const v = sizeOf(d, side);
        if (v != null) { svg += `<text x="${xx}" y="${ln + 3}" font-size="9.5" fill="${SCAN}" text-anchor="middle" font-weight="700">${v}</text>`; }
        else if (hasScan(d)) { svg += `<circle cx="${xx}" cy="${ln}" r="2" fill="${SCAN}" opacity="0.35"/>`; }
      });
      if ((d.note || '').trim()) { svg += `<circle cx="${xx}" cy="${lane.note}" r="3.5" fill="#c79a5a"/>`; }
    }

    // 试纸「跃升」那天：小箭头 + 标注，提示深浅明显往上跳
    if (a.lhSurge) {
      const scd = D.diffDays(start, a.lhSurge.date) + 1;
      if (scd >= 1 && scd <= maxCD) {
        const xx = x(scd);
        svg += `<text x="${xx}" y="${lane.lh - 6}" font-size="10" fill="#5f7174" text-anchor="middle" font-weight="700">↑跃升</text>`;
      }
    }

    // —— 透明点击热区：点某天那一列 → 弹出当天体温/备注（在 views.js 绑定）——
    for (let cd = 1; cd <= maxCD; cd++) {
      const d = byCD[cd]; if (!d) continue;
      svg += `<rect class="bbt-hit" x="${x(cd) - col / 2}" y="${padT}" width="${col}" height="${H - padT - 2}" fill="transparent" data-date="${d.date}" style="cursor:pointer"/>`;
    }

    svg += `</svg>`;
    return svg;
  }

  function legendHTML() {
    const I = window.Icons;
    return `<div class="legend">
      <span><i class="dot" style="background:#ad8a86"></i>体温曲线</span>
      <span><i class="dot" style="background:#8ea1a6"></i>排卵日(竖线)</span>
      <span><i class="dot" style="background:#e0bdb4"></i>易孕窗口(暖·排卵前)</span>
      <span><i class="dot" style="background:#bcd2ce"></i>高温相(冷·排卵后)</span>
      <span style="width:100%;color:#bbb">易孕窗口在排卵线左侧(排卵前几天最易孕)，高温相在右侧(已排卵的黄体期)</span>
      <span style="color:#ad8a86">— — 覆盖线</span>
      <span style="color:#a89f9c">— — 基线(低温相)</span>
      <span><i class="dot" style="background:#ad8a86"></i>经期(经)</span>
      <span><i class="dot" style="background:#fff;border:1.6px solid #ad8a86;box-sizing:border-box"></i>空心＝无排卵出血</span>
      <span>${I.tri(11, '#8ea1a6')} 试纸强阳(纸)</span>
      <span style="width:100%;color:#bbb">试纸行连成阶梯线：点越高＝越接近强阳；标「↑跃升」＝深浅明显往上跳，可能快排卵</span>
      <span>${I.dia(11, '#9aa890')} 蛋清拉丝 / 滑溜(液)</span>
      <span>${I.heart(12, '#ad8a86')} 同房(房)</span>
      <span><b style="color:${SCAN}">11</b> 监测尺寸 mm·左右各一行(左/右)</span>
      <span style="color:${SCAN}">— — 监测标为「已完成」那天</span>
      <span style="width:100%;color:#bbb">左右分开看：两边常各有一个、迟迟分不出大小，就看哪边先跑出来</span>
      <span><i class="dot" style="background:${MED}"></i>淡紫底色＝用药期，体温不作数</span>
      <span style="width:100%;color:#bbb">淡紫虚线那截是被药托高的体温：不参与覆盖线、也不能当排卵证据，这个周期不下排卵结论</span>
      <span><i class="dot" style="background:#c79a5a"></i>当天有备注(备)</span>
      <span style="width:100%;color:#bbb">👆点曲线上某一天，可看当天体温、测量时间和备注全文</span>
      <span style="width:100%;color:#bbb">基线＝你低温相的水平(不随高温漂移)；体温明显升到基线上方、且连续几天＝可能已排卵升温</span>
    </div>`;
  }

  // —— 多周期对比：把最近几个周期的体温曲线按“周期第几天”叠在一起 ——
  const PALETTE = ['#ad8a86', '#8ea1a6', '#9aa890', '#c2a886', '#a596b0'];

  function renderOverlay(cycles, analyses) {
    // 取最近 5 个周期
    const list = cycles.slice(-5);
    let maxCD = 30;
    list.forEach((cy) => (cy.days || []).forEach((d) => {
      if (d.temp != null) maxCD = Math.max(maxCD, D.diffDays(cy.start, d.date) + 1);
    }));

    const col = 22, padL = 34, padR = 12, padT = 16, padB = 30;
    const plotH = 230;
    const W = padL + padR + maxCD * col;
    const H = padT + plotH + padB;
    const x = (cd) => padL + (cd - 0.5) * col;
    const y = (t) => padT + (TMAX - t) / (TMAX - TMIN) * plotH;

    let svg = `<svg id="bbt-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let t = 36.0; t <= 37.0 + 1e-6; t += 0.5) {
      const yy = y(t);
      svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#eee" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${yy + 4}" font-size="10" fill="#aaa" text-anchor="end">${t.toFixed(1)}</text>`;
    }
    for (let cd = 1; cd <= maxCD; cd++) {
      if (cd === 1 || cd % 5 === 0) {
        svg += `<text x="${x(cd)}" y="${padT + plotH + 14}" font-size="10" fill="#bbb" text-anchor="middle">${cd}</text>`;
      }
    }

    list.forEach((cy, k) => {
      const color = PALETTE[k % PALETTE.length];
      const pts = (cy.days || []).filter((d) => d.temp != null)
        .map((d) => ({ cd: D.diffDays(cy.start, d.date) + 1, temp: d.temp }))
        .sort((a, b) => a.cd - b.cd);
      if (!pts.length) return;
      let dpath = '';
      pts.forEach((p, i) => { dpath += (i ? ' L' : 'M') + x(p.cd) + ' ' + y(p.temp); });
      svg += `<path d="${dpath}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85" stroke-linejoin="round"/>`;
      // 排卵日竖标记
      const a = analyses[cy.index];
      if (a && a.ovuCD) {
        const xx = x(a.ovuCD);
        svg += `<line x1="${xx}" y1="${padT}" x2="${xx}" y2="${padT + plotH}" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>`;
      }
    });
    svg += `</svg>`;
    return svg;
  }

  function overlayLegend(cycles, analyses) {
    const list = cycles.slice(-5);
    const items = list.map((cy, k) => {
      const color = PALETTE[k % PALETTE.length];
      const a = analyses[cy.index];
      const ovu = a && a.ovuCD ? `排卵第${a.ovuCD}天` : '未排卵/待定';
      return `<span><i class="dot" style="background:${color}"></i>周期${cy.index}（${cy.start.slice(5)}起 · ${ovu}）</span>`;
    }).join('');
    return `<div class="legend" style="margin-top:12px">${items}<span style="width:100%;color:#bbb">虚线＝各周期排卵日，看排卵在第几天稳不稳定</span></div>`;
  }

  return { render, legendHTML, renderOverlay, overlayLegend };
})();
