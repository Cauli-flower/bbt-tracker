/*
 * cycle.js — 周期与排卵判读（纯函数，便于测试）
 *
 * 提供：
 *   DateU  — 日期工具
 *   Cycle.buildCycles(days, meds)  把每日记录按经期开始切成若干周期
 *   Cycle.analyzeCycle(cycle)      对单个周期做双相/覆盖线/排卵/黄体期判读
 *   Cycle.cycleStats(cycles, settings)  统计平均周期、预测下次月经/排卵/易孕窗口
 */

/* ============ 日期工具 ============ */
window.DateU = (function () {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function toDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function fromDate(dt) { return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
  function addDays(s, n) { const dt = toDate(s); dt.setDate(dt.getDate() + n); return fromDate(dt); }
  function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
  function weekday(s) { return toDate(s).getDay(); } // 0=周日
  // 显示用：6月9日 周二
  function human(s) {
    const dt = toDate(s);
    const wd = '日一二三四五六'[dt.getDay()];
    return `${dt.getMonth() + 1}月${dt.getDate()}日 周${wd}`;
  }
  return { todayStr, toDate, fromDate, addDays, diffDays, weekday, human, pad };
})();

window.Cycle = (function () {
  const D = window.DateU;
  const FLOW = ['light', 'medium', 'heavy']; // 算作经期的经量

  function isPeriod(rec) { return rec && FLOW.indexOf(rec.period) >= 0; }

  // 试纸深浅档位（同一根试纸上，测试线 T 相对对照线 C 有多深）
  const LH_RANK = { negative: 0, faint: 1, medium: 2, near: 3, strong: 4 };

  /* 试纸「跃升」：找最近一次明显往上跳的记录（比上一次测量高 ≥2 档、且到「接近/强阳」）。
   * 抓的是深浅的跳变，而不是「有没有两条杠」——对基础 LH 不高的人更准。
   * 返回 { date, from, to, fresh }（from/to 为档位代码）；没有则 null。fresh=跃升就发生在最后一次测量。 */
  function lhSurge(cycleDays) {
    const seq = (cycleDays || [])
      .filter((d) => d.lh && LH_RANK[d.lh] != null)
      .map((d) => ({ date: d.date, r: LH_RANK[d.lh], lh: d.lh }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (seq.length < 2) return null;
    for (let i = seq.length - 1; i >= 1; i--) {
      const cur = seq[i], prev = seq[i - 1];
      if (cur.r >= 3 && cur.r - prev.r >= 2) {
        return { date: cur.date, from: prev.lh, to: cur.lh, fresh: i === seq.length - 1 };
      }
    }
    return null;
  }

  /* ============ 用药对体温的干扰 ============
   * 孕激素（黄体酮、地屈孕酮等）之类的药会把基础体温整体抬起来。抬上去的那一段
   * 长得跟"排卵后升温"一模一样，如果照单全收，三天高温法则就会判出一次假排卵：
   * 这个周期被写成"已确认排卵"、假的黄体期长度还会进平均值去污染下个周期的预测。
   * 所以疗程上勾了「会影响体温」之后，这几天的体温一律标成"不作数"：
   * 既不能用来确认排卵，也不能进覆盖线的取样窗口。
   *
   * 停药后体温不是当天就掉回去，所以往后多留 TAIL 天。
   */
  const TEMP_TAIL = 2;

  // 疗程列表 → 受影响的日期区间 [{start, end}]
  function confoundRanges(meds) {
    const today = D.todayStr();
    return (meds || []).filter((m) => m && m.affectsTemp && m.start).map((m) => {
      // 没点过「结束这个疗程」的：按计划天数推一个结束日；计划结束日还没到（或没填计划）就算到今天
      const planEnd = m.days ? D.addDays(m.start, m.days - 1) : '';
      const end = m.end || ((planEnd && planEnd < today) ? planEnd : today);
      return { start: m.start, end: D.addDays(end < m.start ? m.start : end, TEMP_TAIL) };
    });
  }

  function inRanges(date, ranges) {
    return (ranges || []).some((r) => date >= r.start && date <= r.end);
  }

  /* 把记录按经期开始日切分成周期。
   * 经期开始日 = 该日有经量，且前一天不是经期。
   * 三种出血分开对待：
   *   真月经          → 新周期起点
   *   无排卵出血      → 不算起点。没排卵就没有黄体，内膜没被完整"关掉"过，
   *                     出的血是局部塌落，只在周期里留标记，天数继续往下数
   *   停药后撤退性出血 → 算起点，且标 medStart。吃孕激素把内膜转成分泌期、停药后
   *                     整层脱落，等于人为造了一次真月经，临床上就当新周期第 1 天
   * meds 传进来是为了标出「体温受用药影响」的那几天（见上方 confoundRanges）。
   * 返回数组：{ index, start, end, isOpen, medStart, days:[...], breakthroughs:[出血日],
   *            confounded:[体温不作数的日期] }
   */
  function buildCycles(allDays, meds) {
    const days = (allDays || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    if (days.length === 0) return [];
    const byDate = {};
    days.forEach((d) => { byDate[d.date] = d; });

    // 找每一段出血的第一天，再分成三类。整段里只要有一天勾了就算整段勾了
    // （防止只勾了中间某天）；撤退性出血优先——它是真起点。
    const starts = [], brkDates = [], medStarts = {};
    days.forEach((d) => {
      if (!isPeriod(d)) return;
      if (isPeriod(byDate[D.addDays(d.date, -1)])) return; // 同一段出血的第 2、3 天
      let isBrk = false, isMed = false;
      for (let ds = d.date; isPeriod(byDate[ds]); ds = D.addDays(ds, 1)) {
        if (byDate[ds].withdrawal) isMed = true;
        if (byDate[ds].breakthrough) isBrk = true;
      }
      if (isMed) { starts.push(d.date); medStarts[d.date] = true; }
      else if (isBrk) brkDates.push(d.date);
      else starts.push(d.date);
    });

    const lastDate = days[days.length - 1].date;
    const cycles = [];

    if (starts.length === 0) {
      // 还没记录过经期开始：把全部记录当成一个"未定起点"的周期，仍可画曲线
      cycles.push({ index: 1, start: days[0].date, end: lastDate, isOpen: true, noPeriodStart: true });
    } else {
      let n = 0;
      // 首个经期开始日之前还有数据（起点未记录的那段，常见于刚开始用 app、没补记上次月经）：
      // 单独保留成一个"已结束·起点未记录"的周期，避免标记新月经后这段历史曲线丢失。
      if (days[0].date < starts[0]) {
        cycles.push({ index: ++n, start: days[0].date, end: D.addDays(starts[0], -1), isOpen: false, noPeriodStart: true });
      }
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i];
        const isOpen = i === starts.length - 1;
        const end = isOpen ? lastDate : D.addDays(starts[i + 1], -1);
        cycles.push({ index: ++n, start, end, isOpen });
      }
    }

    // 填充每个周期的记录
    const ranges = confoundRanges(meds);
    cycles.forEach((c) => {
      c.days = days.filter((d) => d.date >= c.start && d.date <= c.end);
      c.nextStart = c.isOpen ? null : D.addDays(c.end, 1);
      // 本周期中途掉过几次血（每段只记第一天）——不切周期，只作标记
      c.breakthroughs = brkDates.filter((b) => b >= c.start && b <= c.end);
      c.medStart = !c.noPeriodStart && !!medStarts[c.start];   // 这个周期是吃药重置出来的
      // 本周期里哪几天的体温受用药影响，不能拿来判排卵
      c.confounded = c.days.filter((d) => typeof d.temp === 'number' && !isNaN(d.temp) &&
        inRanges(d.date, ranges)).map((d) => d.date);
    });
    return cycles;
  }

  /* 三天高温法则：找升温日 + 覆盖线。
   * 候选升温日：前面至少有 4 个可用读数；取其中最近 6 个的最高值 +0.05 作为覆盖线；
   * 候选日及其后连续两个读数都不低于覆盖线 → 确认排卵。
   * allowOff=false（严格）时，受用药影响的点既不进覆盖线取样窗口、也不能当确认用的那三天。
   * 返回 { idx, coverline }；没找到 idx=-1。 */
  function findRise(pts, allowOff) {
    for (let i = 4; i < pts.length; i++) {
      const trio = pts.slice(i, i + 3);
      if (trio.length < 3) break;          // 后面读数不足 3 个，暂不能确认
      if (!allowOff && trio.some((p) => p.off)) continue;
      let prior = pts.slice(0, i);
      if (!allowOff) prior = prior.filter((p) => !p.off);
      prior = prior.slice(-6);
      if (prior.length < 4) continue;
      const cl = +(Math.max.apply(null, prior.map((p) => p.temp)) + 0.05).toFixed(2);
      if (trio.every((p) => p.temp >= cl)) return { idx: i, coverline: cl };
    }
    return { idx: -1, coverline: null };
  }

  /* 对单个周期做判读 */
  function analyzeCycle(cycle) {
    const start = cycle.start;
    const off = {}; (cycle.confounded || []).forEach((d) => { off[d] = true; });
    const pts = (cycle.days || [])
      .filter((d) => typeof d.temp === 'number' && !isNaN(d.temp))
      .map((d) => ({ date: d.date, temp: d.temp, cd: D.diffDays(start, d.date) + 1, off: !!off[d.date] }))
      .sort((a, b) => a.date < b.date ? -1 : 1);

    const result = {
      coverline: null,
      ovulationDate: null,
      ovuCD: null,
      biphasic: false,
      lutealLength: null,
      shortLuteal: false,
      fertileWindow: null,
      ovulationConfirmed: false,   // 体温是否确认了排卵
      classification: 'unknown',   // ovulatory | anovulatory | confounded | unknown（供长期统计）
      state: 'pending',            // biphasic | weak | waiting | anovulatory | confounded | pending
      tempConfounded: false,       // 本周期体温受用药影响，判读已降级
      confounded: cycle.confounded || [],
      title: '',
      text: '',
      lhHint: null,
      lhCaveat: null,
      lhSurge: lhSurge(cycle.days),
      tempPoints: pts,
    };

    // 只用「不受用药影响」的体温找升温 —— 药抬上来的那一段不能当排卵证据
    const offPts = pts.filter((p) => p.off);
    const strict = findRise(pts, false);
    const riseIdx = strict.idx, coverline = strict.coverline;
    // 如果把受药影响的体温也算进去会判出什么（只在严格判读落空时用来解释「本来会误判成排卵」）
    const loose = riseIdx >= 0 ? null : findRise(pts, true);
    // 判读要不要降级：药造出了一次假升温，或者受影响的天数已经多到连"平坦"都说不准
    const blocked = offPts.length > 0 && ((loose && loose.idx >= 0) || offPts.length >= 3);

    if (riseIdx >= 0) {
      const riseDate = pts[riseIdx].date;
      // 排卵日 = 升温日的前一天
      const ovulationDate = D.addDays(riseDate, -1);
      // 升幅也只用干净的点算，免得药抬高的那几天把幅度撑大
      const clean = (arr) => { const c = arr.filter((p) => !p.off); return (c.length ? c : arr).map((p) => p.temp); };
      const low = clean(pts.slice(0, riseIdx));
      const high = clean(pts.slice(riseIdx));
      const lowMean = avg(low), highMean = avg(high);
      const biphasic = (highMean - lowMean) >= 0.2;

      // 黄体期长度
      let luteal, lutealNote = '';
      if (cycle.nextStart) {
        luteal = D.diffDays(ovulationDate, cycle.nextStart);
      } else {
        const lastDate = cycle.days[cycle.days.length - 1].date;
        luteal = D.diffDays(ovulationDate, lastDate);
        lutealNote = '（至今，未到下次月经）';
      }

      result.coverline = coverline;
      result.ovulationDate = ovulationDate;
      result.ovuCD = D.diffDays(start, ovulationDate) + 1;
      result.biphasic = biphasic;
      result.lutealLength = luteal;
      result.fertileWindow = { start: D.addDays(ovulationDate, -5), end: D.addDays(ovulationDate, 1) };

      const lutealTxt = `黄体期 ${luteal} 天${lutealNote}` +
        (cycle.nextStart ? (luteal >= 10 ? '，正常（≥10 天）' : '，偏短（<10 天），黄体功能可留意') : '');

      // 体温升高并维持 → 回头“确认”排卵已发生（比试纸更可靠）
      result.ovulationConfirmed = true;
      result.classification = 'ovulatory';
      if (cycle.nextStart && luteal < 10) result.shortLuteal = true;

      if (biphasic) {
        result.state = 'biphasic';
        result.title = '✓ 本周期呈双相，已确认排卵';
        result.text = `体温在第 ${result.ovuCD} 天附近升高约 ${(highMean - lowMean).toFixed(2)}℃ 并维持，` +
          `这是排卵已经发生的有力证据。排卵日约为 ${D.human(ovulationDate)}（周期第 ${result.ovuCD} 天）；${lutealTxt}。`;
      } else {
        result.state = 'weak';
        result.title = '体温有升高，但幅度偏小';
        result.text = `检测到一次升温（约 ${(highMean - lowMean).toFixed(2)}℃，不足 0.2℃）。` +
          `多半已排卵但信号偏弱，也可能是测量波动。排卵日约为周期第 ${result.ovuCD} 天；${lutealTxt}。`;
      }
    } else if (blocked) {
      // 体温被药托着 —— 这个周期不下排卵结论，也不进长期统计（既不算排卵，也不算无排卵）
      const strong = (cycle.days || []).filter((d) => d.lh === 'strong');
      result.state = 'confounded';
      result.classification = 'confounded';
      result.tempConfounded = true;
      result.title = '本周期体温受用药影响，不做排卵判读';
      const fakeCD = (loose && loose.idx >= 0) ? pts[loose.idx].cd : null;
      result.text =
        `有 ${offPts.length} 天的体温落在用药期间（含停药后 ${TEMP_TAIL} 天）。` +
        (fakeCD
          ? `如果把这几天照单全收，三天高温法则会在<b>第 ${fakeCD} 天</b>判出一次"升温并维持"，` +
            `看着就像排卵后的高温相——但那个台阶是药垫起来的，不是黄体垫起来的。`
          : `这几天体温整体被托高，平不平坦都说明不了问题。`) +
        `所以这个周期<b>不给排卵结论</b>，也不计入「已确认排卵 / 未见排卵」的长期统计，` +
        `免得一个假台阶把后面几个周期的预测一起带偏。要确认这个周期到底排没排，得靠复查或激素。`;
      if (strong.length) {
        const last = strong[strong.length - 1].date;
        result.lhHint = `试纸在 ${D.human(last)} 强阳，提示排卵临近——但本周期体温不能用来复核，` +
          `试纸说什么都只是"预测"。`;
      }
    } else {
      // 没找到体温升高 —— 区分“进行中/可能推迟”与“已结束/可能未排卵”
      const strong = (cycle.days || []).filter((d) => d.lh === 'strong');
      result.classification = 'unknown';
      if (cycle.isOpen) {
        // 进行中：不轻易判“无排卵”，温和提示（长周期/多囊常见）
        const cd = D.diffDays(start, cycle.days[cycle.days.length - 1].date) + 1;
        if (pts.length >= 8 && cd >= 20) {
          result.state = 'waiting';
          result.title = '周期进行中，尚未见升温';
          result.text = `已到周期第 ${cd} 天还没出现持续升温，卵泡期可能偏长、排卵推迟——` +
            `这在周期不规律 / 多囊时很常见，先别急，继续每天测温，排卵后曲线会抬起来。`;
        } else {
          result.state = 'pending';
          result.title = '数据积累中';
          result.text = `已记录 ${pts.length} 天体温。排卵后需连续 3 天升高才能确认，继续测量即可。`;
        }
      } else {
        // 已结束（已来月经）：可回顾判断
        if (pts.length >= 10) {
          result.state = 'anovulatory';
          result.classification = 'anovulatory';
          result.title = '本周期未见明显排卵';
          result.text = `整个周期体温平坦、没有持续升高的台阶，这个周期可能没有排卵（无排卵周期）。` +
            `偶尔一两个很正常；若经常如此、且周期偏长，建议就诊生殖科 / 内分泌科。`;
        } else {
          result.state = 'pending';
          result.title = '体温数据偏少，难以判断';
          result.text = `本周期只记录了 ${pts.length} 天体温，不足以判断是否排卵。下个周期尽量每天测。`;
        }
      }
      // 试纸：明确是“预测”而非“确认”；对多囊多次强阳给出提醒
      if (strong.length) {
        const last = strong[strong.length - 1].date;
        result.lhHint = `试纸在 ${D.human(last)} 强阳，提示排卵临近（通常 24–48 小时内），可安排同房——` +
          `但这是“预测”，要看体温真正升高才算“确认”排卵。`;
        if (strong.length >= 2) {
          result.lhCaveat = `本周期出现 ${strong.length} 次强阳。多囊人群基础 LH 偏高，试纸可能反复强阳或假阳，请以体温为准。`;
        }
      }
    }

    // 用药影响体温的那几天：判读降级时上面已经说过了，这里补的是"没降级、但确实有几天不作数"
    // ——比如药只吃在经期那几天，后面那次升温是干净的体温判出来的，得说清楚它可信
    if (offPts.length && !result.tempConfounded) {
      const cds = offPts.map((p) => p.cd);
      result.confoundedNote =
        `第 ${cds[0]}–${cds[cds.length - 1]} 天的体温落在用药期间（含停药后 ${TEMP_TAIL} 天），` +
        `已标为<b>不作数</b>：不参与覆盖线取样，也不能单独当排卵证据。` +
        (riseIdx >= 0 ? `上面这次升温是用<b>不受药影响</b>的体温判出来的，可以放心看。` : '');
    }

    // 中途的「无排卵出血」：不切周期、不重新计天，只在这里说清楚它是什么
    const brk = cycle.breakthroughs || [];
    result.breakthroughs = brk;
    if (brk.length) {
      const items = brk.map((b) => `第 ${D.diffDays(start, b) + 1} 天（${D.human(b).replace(/ 周.$/, '')}）`).join('、');
      const ago = cycle.isOpen ? `距今 ${D.diffDays(brk[brk.length - 1], D.todayStr())} 天。` : '';
      // 内层薄或薄厚不均时，多半不是「长太厚塌掉」，而是激素水平低平/波动、内层修复不良的局部脱落
      const thin = maxThick(cycle);
      const why = (thin != null && thin < 10)
        ? `监测到的内层最厚 ${thin} mm，并不算厚——这种出血多半不是"长太厚塌下来"，` +
          `而是激素长期低平又有小波动、内层修复不齐，某块先撑不住掉了一点。`
        : `这类出血是内层局部撑不住掉了一块，不是整层完整脱落。`;
      result.breakthroughNote =
        `本周期中途掉过 ${brk.length} 次血：${items}。${ago}${why}` +
        `没排卵就没有黄体，内层从没被完整"关掉"过，所以它不是真月经、` +
        `<b>天数也没有从 1 重新数</b>——你还在同一个周期里。`;
    }

    // 吃孕激素后停药来的撤退性出血：这是"人造的真月经"，本周期第 1 天就从它算
    if (cycle.medStart) {
      result.medStartNote =
        `本周期从一次<b>停药后的撤退性出血</b>起算（${D.human(start).replace(/ 周.$/, '')} ＝ 第 1 天）。` +
        `孕激素把内层转成分泌期、停药后整层一起脱落，等于人为造了一次月经，` +
        `临床上就当新周期第 1 天——所以这次是<b>真的重置了周期</b>，后面的天数、复查时间都按这个起点数。`;
    }

    return result;
  }

  /* 统计与预测（对不规律周期“诚实”：给范围、标注不可靠） */
  function cycleStats(cycles, settings) {
    settings = settings || { avgCycle: 28, avgLuteal: 14 };
    const completed = cycles.filter((c) => !c.isOpen && c.nextStart);
    // 周期长度统计只用"起点确定"的完整周期；起点未记录那段长度不准，排除。
    // 中途的无排卵出血不切周期，所以这里的长度就是「真月经到下次真月经」，是真实周期长度。
    const realCompleted = completed.filter((c) => !c.noPeriodStart);
    const lengths = realCompleted.map((c) => D.diffDays(c.start, c.nextStart));
    // 黄体期只收「体温真确认过排卵」的周期。受用药影响的周期 ovulationConfirmed 为 false，
    // 自动被挡在外面——假排卵日算出来的假黄体期不会进 avgLuteal 去带偏下个周期的预测。
    const lutealLens = [];
    completed.forEach((c) => { const a = analyzeCycle(c); if (a.lutealLength && a.ovulationConfirmed) lutealLens.push(a.lutealLength); });

    const avgCycle = lengths.length ? Math.round(avg(lengths)) : settings.avgCycle;
    const avgLuteal = lutealLens.length ? Math.round(avg(lutealLens)) : settings.avgLuteal;
    const minCycle = lengths.length ? Math.min.apply(null, lengths) : avgCycle;
    const maxCycle = lengths.length ? Math.max.apply(null, lengths) : avgCycle;
    // 不规律：有 ≥2 个完整周期，且极差 >9 天（或标准差大）
    const sd = lengths.length >= 2 ? stddev(lengths) : 0;
    const irregular = lengths.length >= 2 && (maxCycle - minCycle > 9 || sd >= 7);

    const stats = {
      avgCycle, avgLuteal, minCycle, maxCycle, stddev: Math.round(sd * 10) / 10,
      recordedCycles: realCompleted.length,
      lengths, irregular,
      nextPeriod: null, nextPeriodRange: null,
      predictedOvulation: null,
      fertileWindow: null,
      currentCD: null,
      predictionReliable: !irregular,
    };

    const open = cycles.find((c) => c.isOpen);
    if (open && !open.noPeriodStart) {
      // 起点排在今天之后（提前记了将来某天）就先不报天数，免得出现「第 -5 天」
      if (open.start <= D.todayStr()) {
        stats.currentCD = D.diffDays(open.start, D.todayStr()) + 1;
        stats.currentBrk = (open.breakthroughs || []).length;
        stats.currentStart = open.start;
        stats.currentMedStart = !!open.medStart;
      }
      const nextPeriod = D.addDays(open.start, avgCycle);
      const predictedOvu = D.addDays(nextPeriod, -avgLuteal);
      stats.nextPeriod = nextPeriod;
      stats.nextPeriodRange = { start: D.addDays(open.start, minCycle), end: D.addDays(open.start, maxCycle) };
      stats.predictedOvulation = predictedOvu;
      stats.fertileWindow = { start: D.addDays(predictedOvu, -5), end: D.addDays(predictedOvu, 1) };
    }
    return stats;
  }

  /* 排卵长期概览（给医生看的硬通货） */
  function ovulationOverview(cycles) {
    const completed = cycles.filter((c) => !c.isOpen && c.nextStart);
    let ovulatory = 0, anovulatory = 0, unknown = 0, shortLuteal = 0, confounded = 0;
    // 最近若干个“已结束”周期里，连续无排卵的条数
    let recentAnovStreak = 0; let counting = true;
    for (let i = completed.length - 1; i >= 0; i--) {
      const a = analyzeCycle(completed[i]);
      if (a.classification === 'ovulatory') { ovulatory++; if (a.shortLuteal) shortLuteal++; counting = false; }
      else if (a.classification === 'anovulatory') { anovulatory++; if (counting) recentAnovStreak++; }
      // 受用药影响的周期整个跳过：既不计数，也不打断「连续无排卵」的计数。
      // 跟 unknown 不一样——unknown 会把 streak 清零，而这里我们并没有证据说这个周期排了，
      // 不该因为吃了药就把前后两段无排卵切成两截、把该提醒的信号抹掉。
      else if (a.classification === 'confounded') { confounded++; }
      else { unknown++; counting = false; }
    }
    const total = ovulatory + anovulatory + unknown;
    // 温和的就诊提示（不下诊断）
    const suggestSeeDoctor = recentAnovStreak >= 2 ||
      (cycles.find((c) => c.isOpen && !c.noPeriodStart) &&
        D.diffDays(cycles.find((c) => c.isOpen && !c.noPeriodStart).start, D.todayStr()) + 1 > 40);
    return { total, ovulatory, anovulatory, unknown, shortLuteal, confounded, recentAnovStreak, suggestSeeDoctor };
  }

  // 本周期监测到的内层最厚是多少 mm（没记过返回 null）
  function maxThick(cycle) {
    const vs = (cycle.days || []).map((d) => d.scan && d.scan.thick).filter((v) => v != null);
    return vs.length ? Math.max.apply(null, vs) : null;
  }

  function avg(arr) { return arr.reduce((s, x) => s + x, 0) / arr.length; }
  function stddev(arr) { const m = avg(arr); return Math.sqrt(avg(arr.map((x) => (x - m) * (x - m)))); }

  return { buildCycles, analyzeCycle, cycleStats, ovulationOverview, isPeriod, confoundRanges, TEMP_TAIL };
})();
