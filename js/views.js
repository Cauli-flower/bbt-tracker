/*
 * views.js — 四个页面的渲染与交互
 * 依赖：Store / Cycle / DateU / Chart
 */
window.Views = (function () {
  const D = window.DateU;
  const $app = () => document.getElementById('app');
  const $title = () => document.getElementById('view-title');
  const $sub = () => document.getElementById('header-sub');

  const state = {
    date: D.todayStr(),                 // 记录页当前日期
    month: D.todayStr().slice(0, 7),    // 日历页当前月份 YYYY-MM
    cycleIdx: null,                     // 曲线页选中的周期 index（null=最新）
    chartMode: 'single',                // 曲线页：single | compare
  };
  let _cur = null; // 记录页工作副本

  function blank(date) {
    return { date, temp: null, tempTime: '', period: 'none', lh: 'none', mucus: 'none', intercourse: false, note: '' };
  }
  function isEmpty(r) {
    return r.temp == null && r.period === 'none' && r.lh === 'none' &&
      r.mucus === 'none' && !r.intercourse && !(r.note || '').trim() && !r.tempTime;
  }

  // 已保存内容清单（基于真正存入的记录，便于确认存没存上、存了哪些项）
  const PERIOD_L = { light: '少', medium: '中', heavy: '多' };
  const LH_L = { negative: '阴性', weak: '弱阳', strong: '强阳', fading: '转弱' };
  const MUCUS_L = { dry: '干', wet: '湿润', slippery: '滑溜', sticky: '黏稠', creamy: '乳白', eggwhite: '蛋清拉丝' };
  function daySummaryHTML(rec) {
    if (!rec || isEmpty(rec)) return '<div class="sum-empty">这一天还没有保存任何记录。填好后记得点下面「保存」。</div>';
    const chips = [];
    if (rec.temp != null) chips.push(`<span class="sum-chip">体温 <b>${rec.temp.toFixed(2)}℃</b>${rec.tempTime ? ' · ' + rec.tempTime : ''}</span>`);
    if (PERIOD_L[rec.period]) chips.push(`<span class="sum-chip">经量 <b>${PERIOD_L[rec.period]}</b></span>`);
    if (LH_L[rec.lh]) chips.push(`<span class="sum-chip">试纸 <b>${LH_L[rec.lh]}</b></span>`);
    if (MUCUS_L[rec.mucus]) chips.push(`<span class="sum-chip">黏液 <b>${MUCUS_L[rec.mucus]}</b></span>`);
    if (rec.intercourse) chips.push(`<span class="sum-chip">同房 ${Icons.heart(13, '#ad8a86')}</span>`);
    if ((rec.note || '').trim()) chips.push('<span class="sum-chip">备注 <b>已填</b></span>');
    return `<div class="sum-list">${chips.join('')}</div>`;
  }
  function refreshSummary() {
    const ds = document.getElementById('day-summary');
    if (ds) ds.innerHTML = daySummaryHTML(isEmpty(_cur) ? null : _cur);
  }

  /* ---------------- 工具 ---------------- */
  function seg(group, name, options, current) {
    return `<div class="seg ${group}" data-seg="${name}">` +
      options.map((o) => `<button data-val="${o.v}" class="${o.v === current ? 'on' : ''}">${o.label}</button>`).join('') +
      `</div>`;
  }
  function bindSeg(container, onChange) {
    container.querySelectorAll('.seg').forEach((segEl) => {
      segEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-val]'); if (!btn) return;
        segEl.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
        onChange(segEl.dataset.seg, btn.dataset.val);
      });
    });
  }

  /* 自定义日历弹窗（替代浏览器原生控件，手机/电脑一致、配色统一、点击区大） */
  function openDatePicker(selected, maxDate, onPick) {
    const today = D.todayStr();
    let view = selected.slice(0, 7); // 当前显示的月份 YYYY-MM
    const maxMonth = maxDate.slice(0, 7);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }

    function draw() {
      const [y, m] = view.split('-').map(Number);
      const lead = new Date(y, m - 1, 1).getDay();
      const dim = new Date(y, m, 0).getDate();
      const atMax = view >= maxMonth;
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<div class="dp-cell empty"></div>';
      for (let d = 1; d <= dim; d++) {
        const ds = `${y}-${D.pad(m)}-${D.pad(d)}`;
        const dis = ds > maxDate;
        const cls = ['dp-cell'];
        if (ds === selected) cls.push('sel');
        if (ds === today) cls.push('today');
        cells += `<button class="${cls.join(' ')}" data-d="${ds}" ${dis ? 'disabled' : ''}>${d}</button>`;
      }
      overlay.innerHTML = `
        <div class="dp-card">
          <div class="dp-head">
            <button class="dp-nav" data-mm="-1">‹</button>
            <div class="dp-title">${y} 年 ${m} 月</div>
            <button class="dp-nav" data-mm="1" ${atMax ? 'disabled' : ''}>›</button>
          </div>
          <div class="dp-week">${['日','一','二','三','四','五','六'].map((w) => `<span>${w}</span>`).join('')}</div>
          <div class="dp-grid">${cells}</div>
          <button class="dp-cancel">取消</button>
        </div>`;

      overlay.querySelector('.dp-card').addEventListener('click', (e) => e.stopPropagation());
      overlay.querySelectorAll('[data-mm]').forEach((b) => b.addEventListener('click', () => {
        const [yy, mm] = view.split('-').map(Number);
        const dt = new Date(yy, mm - 1 + parseInt(b.dataset.mm, 10), 1);
        view = `${dt.getFullYear()}-${D.pad(dt.getMonth() + 1)}`;
        draw();
      }));
      overlay.querySelectorAll('.dp-cell[data-d]').forEach((b) => b.addEventListener('click', () => {
        close(); onPick(b.dataset.d);
      }));
      overlay.querySelector('.dp-cancel').addEventListener('click', close);
    }

    overlay.addEventListener('click', close); // 点遮罩关闭
    draw();
  }

  /* 自定义体温数字键盘（替代系统键盘，风格统一） */
  function openNumpad(initial, onConfirm) {
    let buf = (initial != null && !isNaN(initial)) ? String(initial) : '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

    function draw() {
      overlay.innerHTML = `
        <div class="dp-card np-card">
          <div class="np-title">基础体温</div>
          <div class="np-display"><span class="np-val">${buf === '' ? '—' : buf}</span><span class="np-unit">℃</span></div>
          <div class="np-grid">${keys.map((k) => `<button class="np-key${k === '⌫' ? ' np-back' : ''}" data-k="${k}">${k}</button>`).join('')}</div>
          <div class="np-actions">
            <button class="np-cancel">取消</button>
            <button class="np-ok">确定</button>
          </div>
        </div>`;
      overlay.querySelector('.dp-card').addEventListener('click', (e) => e.stopPropagation());
      overlay.querySelectorAll('.np-key').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === '.') { if (buf === '') buf = '0.'; else if (!buf.includes('.')) buf += '.'; }
        else {
          if (buf.includes('.') && buf.split('.')[1].length >= 2) return; // 最多 2 位小数
          if (buf.replace('.', '').length >= 4) return;                    // 最多 4 位数字
          buf += k;
        }
        overlay.querySelector('.np-val').textContent = buf === '' ? '—' : buf;
      }));
      overlay.querySelector('.np-cancel').addEventListener('click', close);
      overlay.querySelector('.np-ok').addEventListener('click', () => {
        const v = buf === '' ? null : parseFloat(buf);
        if (v != null && (isNaN(v) || v < 34 || v > 43)) { toast('请输入 34–43 之间的体温'); return; }
        close(); onConfirm(v);
      });
    }
    overlay.addEventListener('click', close);
    draw();
  }

  /* 自定义时间选择（时:分 两列滚动） */
  function openTimePicker(initial, onConfirm) {
    let h = 6, mm = 30;
    if (initial && /^\d{1,2}:\d{2}$/.test(initial)) { const p = initial.split(':'); h = +p[0]; mm = +p[1]; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const mins = Array.from({ length: 60 }, (_, i) => i);

    overlay.innerHTML = `
      <div class="dp-card tp-card">
        <div class="np-title">测量时间</div>
        <div class="tp-cols">
          <div class="tp-col" id="tp-h">${hours.map((x) => `<button class="tp-cell${x === h ? ' sel' : ''}" data-h="${x}">${D.pad(x)}</button>`).join('')}</div>
          <div class="tp-colon">:</div>
          <div class="tp-col" id="tp-m">${mins.map((x) => `<button class="tp-cell${x === mm ? ' sel' : ''}" data-m="${x}">${D.pad(x)}</button>`).join('')}</div>
        </div>
        <div class="np-actions">
          <button class="np-cancel" id="tp-clear">清空</button>
          <button class="np-ok" id="tp-ok">确定</button>
        </div>
      </div>`;
    overlay.querySelector('.dp-card').addEventListener('click', (e) => e.stopPropagation());

    function pick(col, sel) { col.querySelectorAll('.tp-cell').forEach((c) => c.classList.remove('sel')); sel.classList.add('sel'); }
    const colH = overlay.querySelector('#tp-h'), colM = overlay.querySelector('#tp-m');
    colH.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { h = +b.dataset.h; pick(colH, b); }));
    colM.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { mm = +b.dataset.m; pick(colM, b); }));
    overlay.querySelector('#tp-ok').addEventListener('click', () => { close(); onConfirm(`${D.pad(h)}:${D.pad(mm)}`); });
    overlay.querySelector('#tp-clear').addEventListener('click', () => { close(); onConfirm(''); });
    overlay.addEventListener('click', close);
    // 选中项滚动到中间
    setTimeout(() => {
      [colH, colM].forEach((col) => { const s = col.querySelector('.sel'); if (s) col.scrollTop = s.offsetTop - col.clientHeight / 2 + s.clientHeight / 2; });
    }, 0);
  }

  /* 保存状态提示 */
  let _dirty = false;
  function markDirty() { _dirty = true; renderStatus(); }
  function setSaved() { _dirty = false; renderStatus(); }
  function renderStatus() {
    const el = document.getElementById('save-status');
    if (el) {
      if (_dirty) { el.className = 'save-pill unsaved'; el.textContent = '● 未保存的修改'; }
      else if (_cur && isEmpty(_cur)) { el.className = 'save-pill'; el.textContent = '尚未记录'; }
      else { el.className = 'save-pill saved'; el.textContent = '✓ 已保存'; }
    }
    const sb = document.getElementById('btn-save');
    if (sb) sb.classList.toggle('is-dirty', _dirty);
  }

  /* ==================================================================
   *  记录页
   * ================================================================== */
  async function record() {
    $title().textContent = '今日记录';
    const date = state.date;
    const saved = await Store.getDay(date);
    _cur = Object.assign(blank(date), saved || {});

    const yDate = D.addDays(date, -1);
    const ySaved = await Store.getDay(yDate);
    const yHas = !!(ySaved && ySaved.intercourse);

    const isToday = date === D.todayStr();
    const c = $app();
    c.innerHTML = `
      <div class="date-nav" style="flex-direction:column;align-items:stretch;gap:10px">
        <div class="row-between">
          <div class="date-sub">${isToday ? '今天' : '往日记录'}</div>
          ${isToday ? '' : '<button id="to-today" class="today-btn">回到今天</button>'}
        </div>
        <div class="date-field" id="date-pick-btn" role="button" tabindex="0">
          <span class="date-field-text">${D.human(date)}</span>
          <span class="date-field-btn">${Icons.svg('calendar', { size: 16 })}<span>选择</span><span class="caret">▾</span></span>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;margin:-4px 2px 12px">
        <span id="save-status" class="save-pill saved">✓ 已保存</span>
      </div>

      <div class="card" style="padding:14px 16px">
        <h2 style="margin-bottom:10px">本日已保存 <span class="hint">${isToday ? '今天' : D.human(date).replace(/ 周.$/, '')}</span></h2>
        <div id="day-summary">${daySummaryHTML(saved)}</div>
      </div>

      <div class="card">
        <div class="field">
          <label>基础体温 <span class="sub">℃ · 建议每天晨起、同一时间测量</span></label>
          <div class="val-row">
            <button type="button" class="val-field" id="temp-field">
              <span class="val-num" id="temp-disp">${_cur.temp != null ? _cur.temp.toFixed(2) : '点此输入'}</span>
              <span class="val-unit">℃</span>
            </button>
            <button type="button" class="time-field" id="time-field">
              ${Icons.svg('clock', { size: 15 })}
              <span id="time-disp">${_cur.tempTime || '测量时间'}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="field">
          <label>月经 <span class="sub">经量 · 决定周期起点</span></label>
          ${seg('period', 'period', [
            { v: 'none', label: '无' }, { v: 'light', label: '少' },
            { v: 'medium', label: '中' }, { v: 'heavy', label: '多' },
          ], _cur.period)}
          <div class="sub" style="margin-top:8px">误记成月经了？把经量改回“无”即可，周期会自动重算。</div>
        </div>
        <div class="field">
          <label>排卵试纸 LH</label>
          ${seg('lh', 'lh', [
            { v: 'none', label: '未测' }, { v: 'negative', label: '阴性' },
            { v: 'weak', label: '弱阳' }, { v: 'strong', label: '强阳' }, { v: 'fading', label: '转弱' },
          ], _cur.lh)}
        </div>
        <div class="field">
          <label>宫颈黏液 <span class="sub">不会看分泌物？凭感觉选「湿润 / 滑溜」就行</span></label>
          ${seg('mucus', 'mucus', [
            { v: 'none', label: '未观察' }, { v: 'dry', label: '干' },
            { v: 'wet', label: '湿润' }, { v: 'slippery', label: '滑溜' },
            { v: 'sticky', label: '黏稠' }, { v: 'creamy', label: '乳白' }, { v: 'eggwhite', label: '蛋清拉丝' },
          ], _cur.mucus)}
          <div class="sub" style="margin-top:8px">「滑溜」＝走动时有润滑感，和「蛋清拉丝」一样接近排卵、最易孕；平时多是「干」。看不清就只凭感觉选，比纠结分泌物形态轻松。</div>
        </div>
        <div class="field">
          <label>同房 <span class="sub">记在实际发生那天</span></label>
          ${seg('bool', 'intercourse', [
            { v: 'no', label: '无' }, { v: 'yes', label: '有 ' + Icons.heart(14, '#ad8a86') },
          ], _cur.intercourse ? 'yes' : 'no')}
          <button class="btn ghost" id="btn-last-night" style="margin-top:8px;padding:9px;font-size:14px">
            ${yHas ? '昨晚已记 ' + Icons.heart(14, '#ad8a86') + '（点此取消）' : '＋ 记一笔“昨晚同房”'}
          </button>
        </div>
        <div class="field">
          <label>备注 / 心情</label>
          <textarea id="f-note" placeholder="任何想记的：感受、症状、用药……">${_cur.note || ''}</textarea>
        </div>
      </div>

      <button class="btn" id="btn-save">保存</button>
      ${saved ? '<button class="btn ghost" id="btn-del">清除本日记录</button>' : ''}
    `;

    // 新载入的一天视为「已保存」状态
    _dirty = false; renderStatus();

    // —— 绑定 ——
    // 体温：自定义数字键盘
    c.querySelector('#temp-field').addEventListener('click', () => {
      openNumpad(_cur.temp, (v) => {
        _cur.temp = v;
        c.querySelector('#temp-disp').textContent = v != null ? v.toFixed(2) : '点此输入';
        markDirty();
      });
    });
    // 测量时间：自定义时间选择
    c.querySelector('#time-field').addEventListener('click', () => {
      openTimePicker(_cur.tempTime, (t) => {
        _cur.tempTime = t;
        c.querySelector('#time-disp').textContent = t || '测量时间';
        markDirty();
      });
    });
    c.querySelector('#f-note').addEventListener('input', (e) => { _cur.note = e.target.value; markDirty(); });
    bindSeg(c, (name, val) => {
      if (name === 'intercourse') _cur.intercourse = (val === 'yes');
      else _cur[name] = val;
      markDirty();
    });

    c.querySelector('#date-pick-btn').addEventListener('click', () => {
      openDatePicker(state.date, D.todayStr(), async (picked) => {
        await saveCur(true); state.date = picked; record();
      });
    });
    const todayBtn = c.querySelector('#to-today');
    if (todayBtn) todayBtn.addEventListener('click', async () => {
      await saveCur(true); state.date = D.todayStr(); record();
    });

    c.querySelector('#btn-last-night').addEventListener('click', async () => {
      await saveCur(true);                       // 先存今天，避免丢编辑
      const y = (await Store.getDay(yDate)) || blank(yDate);
      y.intercourse = !y.intercourse;
      if (isEmpty(y)) await Store.deleteDay(yDate); else await Store.putDay(y);
      toast(y.intercourse ? '已记到昨天的同房' : '已取消昨天');
      record();
    });

    c.querySelector('#btn-save').addEventListener('click', async () => { await saveCur(); setSaved(); refreshSummary(); toast('已保存 ✓'); });
    const del = c.querySelector('#btn-del');
    if (del) del.addEventListener('click', async () => {
      if (confirm('确定清除这一天的记录吗？')) { await Store.deleteDay(state.date); toast('已清除'); record(); }
    });

    updateSub();
  }

  // 保存工作副本；silent=true 时静默（用于切日期）。空记录则不写。
  async function saveCur(silent) {
    if (!_cur) return;
    if (isEmpty(_cur)) { await Store.deleteDay(_cur.date); return; }
    await Store.putDay(Object.assign({}, _cur));
  }

  async function updateSub() {
    const days = await Store.allDays();
    const cycles = Cycle.buildCycles(days);
    const open = cycles.find((c) => c.isOpen && !c.noPeriodStart);
    if (open) {
      const cd = D.diffDays(open.start, state.date) + 1;
      $sub().textContent = cd >= 1 ? `周期第 ${cd} 天` : '';
    } else { $sub().textContent = ''; }
  }

  /* ==================================================================
   *  曲线页
   * ================================================================== */
  const SHAPE = { biphasic: '双相', weak: '升温偏弱', waiting: '进行中', anovulatory: '未见排卵', pending: '待定' };
  const VCLASS = { biphasic: 'biphasic', weak: 'mono', anovulatory: 'mono', waiting: 'pending', pending: 'pending' };

  async function chart() {
    $title().textContent = '体温曲线'; $sub().textContent = '';
    const days = await Store.allDays();
    const cycles = Cycle.buildCycles(days);
    const c = $app();

    if (!cycles.length || days.filter((d) => d.temp != null).length === 0) {
      c.innerHTML = `<div class="empty-tip">还没有体温数据。<br>到「记录」页每天填上晨起体温，<br>这里就会自动画出双相曲线，并判断排卵日。</div>`;
      return;
    }

    const analyses = {}; cycles.forEach((cy) => { analyses[cy.index] = Cycle.analyzeCycle(cy); });

    // 模式切换：单周期 / 周期概览 / 曲线对比
    const mode = state.chartMode || 'single';
    const modeBtn = (m, label) => `<button data-mode="${m}" class="${mode === m ? 'on' : ''}" style="${mode === m ? 'background:var(--pink);color:#fff;border-color:transparent' : ''}">${label}</button>`;
    const modeBar = `<div class="seg" style="margin-bottom:14px">${modeBtn('single', '单周期')}${modeBtn('overview', '周期概览')}${modeBtn('compare', '曲线对比')}</div>`;

    if (mode === 'overview') {
      renderOverview(c, modeBar, cycles, analyses);
      bindMode(c);
      return;
    }

    if (mode === 'compare') {
      if (cycles.length < 2) {
        c.innerHTML = modeBar + `<div class="empty-tip">需要至少 2 个完整周期才能对比。<br>继续记录，攒够后回来看排卵日稳不稳定。</div>`;
      } else {
        c.innerHTML = modeBar + `
          <div class="verdict pending"><div class="vtitle">多周期对比</div>
            <div>把最近几个周期的体温曲线按“周期第几天”叠在一起，看你的排卵日是否落在相近的位置——排卵日越分散，往往说明周期越不规律。</div>
          </div>
          <div class="card">
            <div class="chart-wrap">${Chart.renderOverlay(cycles, analyses)}</div>
            ${Chart.overlayLegend(cycles, analyses)}
          </div>`;
      }
      bindMode(c);
      return;
    }

    // —— 单周期 ——
    let idx = state.cycleIdx;
    if (idx == null || !cycles.find((x) => x.index === idx)) idx = cycles[cycles.length - 1].index;
    const cycle = cycles.find((x) => x.index === idx);
    const a = analyses[idx];

    const options = cycles.map((cy) => {
      const label = `周期 ${cy.index}（${cy.start.slice(5)} 起${cy.isOpen ? '·进行中' : ''}）`;
      return `<option value="${cy.index}" ${cy.index === idx ? 'selected' : ''}>${label}</option>`;
    }).join('');

    const vClass = VCLASS[a.state] || 'pending';
    const ovuTxt = a.ovulationConfirmed ? `${D.human(a.ovulationDate).replace(/ 周.$/, '')}（第${a.ovuCD}天）` : '未确认';
    const lutealTxt = a.lutealLength != null ? `${a.lutealLength} 天` : '—';
    const cdays = cycle.days.length ? D.diffDays(cycle.start, cycle.days[cycle.days.length - 1].date) + 1 : 0;
    const confirmBadge = a.ovulationConfirmed
      ? '<span class="pill" style="background:#dde3e2;color:#586d70">体温已确认</span>'
      : (a.lhHint ? '<span class="pill">试纸预测·待体温确认</span>' : '');

    c.innerHTML = modeBar + `
      <div class="cycle-switch">
        <span class="muted">查看周期</span>
        <select id="cycle-sel">${options}</select>
      </div>

      <div class="verdict ${vClass}">
        <div class="vtitle">${a.title} ${confirmBadge}</div>
        <div>${a.text}</div>
        ${a.lhHint ? `<div style="margin-top:8px">🔎 ${a.lhHint}</div>` : ''}
        ${a.lhCaveat ? `<div style="margin-top:8px;color:#877049">⚠️ ${a.lhCaveat}</div>` : ''}
        ${a.shortLuteal ? `<div style="margin-top:8px;color:#877049">⚠️ 黄体期偏短（<10 天），若多个周期如此可咨询医生。</div>` : ''}
      </div>

      <div class="card">
        <div class="chart-wrap">${Chart.render(cycle, a)}</div>
        ${Chart.legendHTML()}
      </div>

      <div class="stat-grid">
        <div class="stat"><div class="num">${cdays || '—'}</div><div class="lbl">本周期天数</div></div>
        <div class="stat"><div class="num" style="font-size:15px">${ovuTxt}</div><div class="lbl">排卵日(体温确认)</div></div>
        <div class="stat"><div class="num">${lutealTxt}</div><div class="lbl">黄体期长度</div></div>
        <div class="stat"><div class="num" style="font-size:18px">${SHAPE[a.state] || '待定'}</div><div class="lbl">曲线形态</div></div>
      </div>
    `;

    bindMode(c);
    c.querySelector('#cycle-sel').addEventListener('change', (e) => {
      state.cycleIdx = parseInt(e.target.value, 10); chart();
    });
  }

  function bindMode(c) {
    c.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.chartMode = b.dataset.mode; chart();
    }));
  }

  /* 周期概览：把最近若干周期按时间从上到下排成横条，
   * 一眼看「周期长度是否在收窄、排卵(绿色)是否变多」——比叠加乱曲线更适合多囊看趋势。 */
  function renderOverview(c, modeBar, cycles, analyses) {
    const today = D.todayStr();
    const list = cycles.slice(-8); // 最近 8 个周期
    const rows = list.map((cy) => {
      const a = analyses[cy.index];
      const length = cy.isOpen ? D.diffDays(cy.start, today) + 1 : D.diffDays(cy.start, cy.nextStart);
      let status = 'pending';
      if (a.ovulationConfirmed) status = 'ovulatory';
      else if (a.classification === 'anovulatory') status = 'anovulatory';
      return {
        index: cy.index, start: cy.start, length: Math.max(1, length),
        isOpen: cy.isOpen, status, ovuCD: a.ovuCD,
      };
    });

    const maxLen = Math.max(35, ...rows.map((r) => r.length));
    const pct = (n) => (n / maxLen * 100).toFixed(1);
    const COLOR = {
      ovulatory: { base: '#c2d0b0', dark: '#94a87f', txt: '#6f8159' },
      anovulatory: { base: '#dcc18f', dark: '#dcc18f', txt: '#a9803f' },
      pending: { base: '#d6d0d3', dark: '#d6d0d3', txt: '#999' },
    };
    const statLabel = (r) => {
      if (r.status === 'ovulatory') return `排卵<br>第${r.ovuCD}天`;
      if (r.status === 'anovulatory') return '未见<br>排卵';
      return r.isOpen ? '进行中' : '数据<br>不足';
    };

    const rowsHTML = rows.map((r) => {
      const col = COLOR[r.status];
      const lutealW = r.ovuCD ? (pct(r.length) - pct(r.ovuCD)).toFixed(1) : 0;
      return `<div style="display:flex;align-items:center;gap:9px;margin:10px 0">
        <div style="width:60px;flex-shrink:0;line-height:1.3">
          <div style="font-size:12px;font-weight:600;color:#555">周期${r.index}</div>
          <div style="font-size:11px;color:#999">${r.start.slice(5)}·${r.length}天</div>
        </div>
        <div style="position:relative;flex:1;height:24px;background:#f3eef0;border-radius:6px;overflow:hidden">
          <div style="position:absolute;left:0;top:0;bottom:0;width:${pct(r.length)}%;background:${col.base}"></div>
          ${r.status === 'ovulatory' && r.ovuCD ? `
            <div style="position:absolute;left:${pct(r.ovuCD)}%;width:${lutealW}%;top:0;bottom:0;background:${col.dark}"></div>
            <div style="position:absolute;left:calc(${pct(r.ovuCD)}% - 1px);top:0;bottom:0;width:2px;background:#566b6e"></div>` : ''}
        </div>
        <div style="width:46px;flex-shrink:0;text-align:right;font-size:11px;font-weight:600;line-height:1.2;color:${col.txt}">${statLabel(r)}</div>
      </div>`;
    }).join('');

    // 趋势小结（借用既有统计：是否规律 / 长度范围）
    const stats = Cycle.cycleStats(cycles, Store.getSettings());
    const ovuN = rows.filter((r) => r.status === 'ovulatory').length;
    let summary;
    if (stats.recordedCycles < 2) {
      summary = '继续每天记录，攒够 2–3 个完整周期后，这里就能看出你的周期是在变规律、还是仍在波动。';
    } else if (stats.irregular) {
      summary = `最近 ${stats.recordedCycles} 个完整周期长度在 ${stats.minCycle}–${stats.maxCycle} 天之间波动（相差 ${stats.maxCycle - stats.minCycle} 天），目前还不太规律——多囊常如此。重点看<b>随时间横条是否慢慢变得一样长、绿色（排卵）是否变多</b>。`;
    } else {
      summary = `最近 ${stats.recordedCycles} 个完整周期长度比较稳定（${stats.minCycle}–${stats.maxCycle} 天），相对规律。其中 ${ovuN} 个确认了排卵。`;
    }

    c.innerHTML = modeBar + `
      <div class="verdict pending">
        <div class="vtitle">周期概览 · 看是否在变规律</div>
        <div>每行是一个周期（上＝早，下＝近）。<b>横条越长＝周期越长；绿＝已确认排卵，黄＝未见排卵，灰＝进行中/数据不足；竖线＝排卵日。</b></div>
        <div style="margin-top:8px">${summary}</div>
      </div>
      <div class="card">
        ${rows.length ? rowsHTML : '<div class="empty-tip">还没有周期数据。</div>'}
        <div class="legend" style="margin-top:14px">
          <span><i class="dot" style="background:#94a87f"></i>已确认排卵</span>
          <span><i class="dot" style="background:#dcc18f"></i>未见排卵</span>
          <span><i class="dot" style="background:#d6d0d3"></i>进行中/不足</span>
          <span>｜ 竖线＝排卵日</span>
        </div>
        <div class="sub" style="margin-top:10px">提示：多囊的体温曲线常常很乱，别盯单个月份；<b>看几个月的趋势</b>更靠谱。要精确判断排卵，建议结合生殖科 B 超。</div>
      </div>`;
  }

  /* ==================================================================
   *  日历页
   * ================================================================== */
  async function calendar() {
    $title().textContent = '周期日历'; $sub().textContent = '';
    const days = await Store.allDays();
    const byDate = {}; days.forEach((d) => { byDate[d.date] = d; });
    const cycles = Cycle.buildCycles(days);
    const settings = Store.getSettings();
    const stats = Cycle.cycleStats(cycles, settings);

    // 标注：哪些日子是 排卵日 / 易孕窗口（来自已判读周期 + 当前周期预测）
    const ovuDays = {}, fertileDays = {};
    cycles.forEach((cy) => {
      const a = Cycle.analyzeCycle(cy);
      if (a.ovulationDate) ovuDays[a.ovulationDate] = true;
      if (a.fertileWindow) markRange(fertileDays, a.fertileWindow.start, a.fertileWindow.end);
    });
    // 仅在周期规律、预测可靠时，才把“预测的”排卵日/易孕窗口画到日历上（避免假精确）
    if (stats.predictionReliable) {
      if (stats.predictedOvulation) ovuDays[stats.predictedOvulation] = true;
      if (stats.fertileWindow) markRange(fertileDays, stats.fertileWindow.start, stats.fertileWindow.end);
    }
    const overview = Cycle.ovulationOverview(cycles);

    const c = $app();
    c.innerHTML = `
      ${statsCards(stats)}
      ${overviewCard(overview, stats)}
      <div class="card">
        <div class="cal-head">
          <button data-m="-1">‹</button>
          <div class="cal-title">${state.month.replace('-', ' 年 ')} 月</div>
          <button data-m="1">›</button>
        </div>
        <div class="cal-grid">
          ${['日','一','二','三','四','五','六'].map((w) => `<div class="cal-wd">${w}</div>`).join('')}
          ${calCells(byDate, cycles, ovuDays, fertileDays)}
        </div>
        <div class="legend" style="margin-top:14px">
          <span><i class="dot" style="background:#e3d6d2"></i>经期</span>
          <span><i class="dot" style="background:#dde3e2"></i>易孕窗口</span>
          <span><i class="dot" style="background:#8ea1a6"></i>排卵日</span>
          <span>${Icons.heart(12, '#ad8a86')} 同房 · ${Icons.tri(11, '#8ea1a6')} 强阳</span>
        </div>
      </div>
    `;

    c.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('click', () => {
      const [y, m] = state.month.split('-').map(Number);
      const dt = new Date(y, m - 1 + parseInt(el.dataset.m, 10), 1);
      state.month = `${dt.getFullYear()}-${D.pad(dt.getMonth() + 1)}`;
      calendar();
    }));
    c.querySelectorAll('.cal-cell[data-date]').forEach((el) => el.addEventListener('click', () => {
      state.date = el.dataset.date; switchTo('record');
    }));
  }

  function markRange(map, a, b) { let d = a; let guard = 0; while (d <= b && guard < 60) { map[d] = true; d = D.addDays(d, 1); guard++; } }

  function calCells(byDate, cycles, ovuDays, fertileDays) {
    const [y, m] = state.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = D.todayStr();
    let html = '';
    for (let i = 0; i < lead; i++) html += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${y}-${D.pad(m)}-${D.pad(day)}`;
      const rec = byDate[ds];
      const cls = ['cal-cell'];
      if (ds === today) cls.push('today');
      if (ovuDays[ds]) cls.push('ovu');
      else if (Cycle.isPeriod(rec)) cls.push('period');
      else if (fertileDays[ds]) cls.push('fertile');

      // 周期第几天
      let cdLabel = '';
      const cy = cycles.find((cc) => ds >= cc.start && ds <= cc.end);
      if (cy && !cy.noPeriodStart) cdLabel = `<span class="cd">${D.diffDays(cy.start, ds) + 1}</span>`;

      let marks = '';
      if (rec) {
        if (rec.intercourse) marks += Icons.heart(9, '#ad8a86');
        if (rec.lh === 'strong') marks += Icons.tri(9, '#8ea1a6');
      }
      html += `<div class="${cls.join(' ')}" data-date="${ds}">${cdLabel}<span>${day}</span>` +
        (marks ? `<span class="marks">${marks}</span>` : '') + `</div>`;
    }
    return html;
  }

  function statsCards(s) {
    const cyc = s.currentCD ? `${s.currentCD}` : '—';
    const cycleTxt = s.irregular ? `${s.minCycle}~${s.maxCycle}` : `${s.avgCycle}`;
    const cycleLbl = s.irregular ? '周期范围(天)' : '平均周期(天)';
    // 不规律 → 显示范围；规律 → 显示具体日期
    let np = '—';
    if (s.irregular && s.nextPeriodRange) np = `${s.nextPeriodRange.start.slice(5)}~${s.nextPeriodRange.end.slice(5)}`;
    else if (s.nextPeriod) np = `${D.human(s.nextPeriod).replace(/ 周.$/, '')}`;
    const fw = (!s.irregular && s.fertileWindow) ? `${s.fertileWindow.start.slice(5)}~${s.fertileWindow.end.slice(5)}` : (s.irregular ? '以实时信号为准' : '—');

    const banner = s.irregular ? `<div class="verdict pending" style="margin-bottom:14px">
      <div class="vtitle">周期不太规律</div>
      <div>最近 ${s.recordedCycles} 个周期长度在 ${s.minCycle}–${s.maxCycle} 天之间波动较大，所以日历推算只能给个大概范围。
      更建议看“实时信号”——试纸强阳、蛋清拉丝、体温升高，而不是日历预测。</div></div>` : '';

    return banner + `<div class="stat-grid" style="margin-bottom:14px">
      <div class="stat"><div class="num" style="${s.irregular ? 'font-size:18px' : ''}">${cycleTxt}</div><div class="lbl">${cycleLbl}</div></div>
      <div class="stat"><div class="num">${cyc}</div><div class="lbl">当前周期第几天</div></div>
      <div class="stat"><div class="num" style="font-size:15px">${np}</div><div class="lbl">预测下次月经</div></div>
      <div class="stat"><div class="num" style="font-size:15px">${fw}</div><div class="lbl">预测易孕窗口</div></div>
    </div>`;
  }

  function overviewCard(o, stats) {
    if (!o.total) return '';   // 还没有完整周期
    const doctor = o.suggestSeeDoctor ? `<div style="margin-top:10px;color:#877049">⚠️ ${
      o.recentAnovStreak >= 2 ? '最近连续多个周期未见排卵' : '当前周期已偏长'
    }，建议就诊生殖科 / 内分泌科做进一步检查（B 超、激素等）。仅作提醒，不代表诊断。</div>` : '';
    return `<div class="card">
      <h2>排卵概览 <span class="hint">按体温确认 · 共 ${o.total} 个完整周期</span></h2>
      <div class="stat-grid">
        <div class="stat"><div class="num" style="color:#7a8a6e">${o.ovulatory}</div><div class="lbl">已确认排卵</div></div>
        <div class="stat"><div class="num" style="color:#a98a5f">${o.anovulatory}</div><div class="lbl">未见排卵</div></div>
        <div class="stat"><div class="num" style="color:#aaa">${o.unknown}</div><div class="lbl">数据不足</div></div>
        <div class="stat"><div class="num" style="color:#a98a5f">${o.shortLuteal}</div><div class="lbl">黄体期偏短</div></div>
      </div>
      ${doctor}
    </div>`;
  }

  /* ==================================================================
   *  设置页
   * ================================================================== */
  async function settings() {
    $title().textContent = '设置'; $sub().textContent = '';
    const s = Store.getSettings();
    const days = await Store.allDays();
    const c = $app();
    c.innerHTML = `
      <div class="card">
        <h2>数据备份</h2>
        <p class="muted" style="margin-top:0">共 ${days.length} 天记录。数据只存在本机，换手机时请先导出备份。</p>
        <button class="btn secondary" id="btn-export">导出备份文件</button>
        <button class="btn secondary" id="btn-import">从备份文件恢复</button>
        <input type="file" id="file-input" accept="application/json,.json" style="display:none" />
      </div>

      <div class="card">
        <h2>周期校准 <span class="hint">数据不足时用于预测</span></h2>
        <div class="field">
          <label>平均周期长度（天）</label>
          <input type="number" id="s-cycle" min="20" max="45" value="${s.avgCycle}"
            style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:10px;font-size:16px" />
        </div>
        <div class="field">
          <label>平均黄体期长度（天） <span class="sub">一般 12–14 天</span></label>
          <input type="number" id="s-luteal" min="8" max="18" value="${s.avgLuteal}"
            style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:10px;font-size:16px" />
        </div>
        <button class="btn ghost" id="btn-save-settings">保存校准</button>
      </div>

      <div class="card">
        <h2>关于</h2>
        <p class="muted" style="line-height:1.7;margin:0">
          这是一个本地、私密的身体记录工具。所有数据保存在你手机的浏览器里，不会上传到任何服务器。<br><br>
          判读结果（双相、排卵日、易孕窗口）由体温曲线自动估算，仅供参考，不能替代医生诊断。
        </p>
      </div>

      <button class="btn ghost" id="btn-reset" style="color:#b07a6e">清空全部数据</button>
    `;

    c.querySelector('#btn-export').addEventListener('click', exportData);
    c.querySelector('#btn-import').addEventListener('click', () => c.querySelector('#file-input').click());
    c.querySelector('#file-input').addEventListener('change', importData);
    c.querySelector('#btn-save-settings').addEventListener('click', () => {
      const avgCycle = parseInt(c.querySelector('#s-cycle').value, 10) || 28;
      const avgLuteal = parseInt(c.querySelector('#s-luteal').value, 10) || 14;
      Store.saveSettings({ avgCycle, avgLuteal }); toast('已保存校准 ✓');
    });
    c.querySelector('#btn-reset').addEventListener('click', async () => {
      if (confirm('这会删除全部记录，且无法恢复。\n建议先导出备份。确定清空？')) {
        await Store.clearAll(); toast('已清空'); settings();
      }
    });
  }

  async function exportData() {
    const data = await Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `体温记录备份-${D.todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出备份');
  }

  function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const n = await Store.importAll(data);
        toast(`已导入 ${n} 天记录 ✓`); settings();
      } catch (err) { alert('导入失败：' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ---------------- 切换 ---------------- */
  let switchTo = () => {};
  function setSwitch(fn) { switchTo = fn; }

  return { record, chart, calendar, settings, state, setSwitch, saveCur };
})();

/* 轻量 toast */
window.toast = (function () {
  let el = null, timer = null;
  return function (msg) {
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), 1600);
  };
})();
