/*
 * cycle.js — 周期与排卵判读（纯函数，便于测试）
 *
 * 提供：
 *   DateU  — 日期工具
 *   Cycle.buildCycles(days)        把每日记录按经期开始切成若干周期
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

  /* 把记录按经期开始日切分成周期。
   * 经期开始日 = 该日有经量，且前一天不是经期。
   * 返回数组：{ index, start, end, isOpen, days:[按日期升序的本周期记录] }
   */
  function buildCycles(allDays) {
    const days = (allDays || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    if (days.length === 0) return [];
    const byDate = {};
    days.forEach((d) => { byDate[d.date] = d; });

    // 找所有经期开始日
    const starts = [];
    days.forEach((d) => {
      if (!isPeriod(d)) return;
      const prev = byDate[D.addDays(d.date, -1)];
      if (!isPeriod(prev)) starts.push(d.date);
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
    cycles.forEach((c) => {
      c.days = days.filter((d) => d.date >= c.start && d.date <= c.end);
      c.nextStart = c.isOpen ? null : D.addDays(c.end, 1);
    });
    return cycles;
  }

  /* 对单个周期做判读 */
  function analyzeCycle(cycle) {
    const start = cycle.start;
    const pts = (cycle.days || [])
      .filter((d) => typeof d.temp === 'number' && !isNaN(d.temp))
      .map((d) => ({ date: d.date, temp: d.temp, cd: D.diffDays(start, d.date) + 1 }))
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
      classification: 'unknown',   // ovulatory | anovulatory | unknown（供长期统计）
      state: 'pending',            // biphasic | weak | waiting | anovulatory | pending
      title: '',
      text: '',
      lhHint: null,
      lhCaveat: null,
      tempPoints: pts,
    };

    // 找覆盖线 + 三天高温法则
    // 候选升温日：其前面至少有 4 个体温读数；取前 6 个的最高值 +0.05 作为覆盖线；
    // 候选日及其后连续两个读数都不低于覆盖线 → 确认排卵。
    let riseIdx = -1, coverline = null;
    for (let i = 4; i < pts.length; i++) {
      const prior = pts.slice(Math.max(0, i - 6), i);
      if (prior.length < 4) continue;
      const maxPrior = Math.max.apply(null, prior.map((p) => p.temp));
      const cl = +(maxPrior + 0.05).toFixed(2);
      const trio = pts.slice(i, i + 3);
      if (trio.length < 3) break; // 后面读数不足 3 个，暂不能确认
      if (trio.every((p) => p.temp >= cl)) {
        riseIdx = i; coverline = cl; break;
      }
    }

    if (riseIdx >= 0) {
      const riseDate = pts[riseIdx].date;
      // 排卵日 = 升温日的前一天
      const ovulationDate = D.addDays(riseDate, -1);
      const low = pts.slice(0, riseIdx).map((p) => p.temp);
      const high = pts.slice(riseIdx).map((p) => p.temp);
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

    return result;
  }

  /* 统计与预测（对不规律周期“诚实”：给范围、标注不可靠） */
  function cycleStats(cycles, settings) {
    settings = settings || { avgCycle: 28, avgLuteal: 14 };
    const completed = cycles.filter((c) => !c.isOpen && c.nextStart);
    // 周期长度统计只用"起点确定"的完整周期；起点未记录那段长度不准，排除
    const realCompleted = completed.filter((c) => !c.noPeriodStart);
    const lengths = realCompleted.map((c) => D.diffDays(c.start, c.nextStart));
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
      stats.currentCD = D.diffDays(open.start, D.todayStr()) + 1;
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
    let ovulatory = 0, anovulatory = 0, unknown = 0, shortLuteal = 0;
    // 最近若干个“已结束”周期里，连续无排卵的条数
    let recentAnovStreak = 0; let counting = true;
    for (let i = completed.length - 1; i >= 0; i--) {
      const a = analyzeCycle(completed[i]);
      if (a.classification === 'ovulatory') { ovulatory++; if (a.shortLuteal) shortLuteal++; counting = false; }
      else if (a.classification === 'anovulatory') { anovulatory++; if (counting) recentAnovStreak++; }
      else { unknown++; counting = false; }
    }
    const total = completed.length;
    // 温和的就诊提示（不下诊断）
    const suggestSeeDoctor = recentAnovStreak >= 2 ||
      (cycles.find((c) => c.isOpen && !c.noPeriodStart) &&
        D.diffDays(cycles.find((c) => c.isOpen && !c.noPeriodStart).start, D.todayStr()) + 1 > 40);
    return { total, ovulatory, anovulatory, unknown, shortLuteal, recentAnovStreak, suggestSeeDoctor };
  }

  function avg(arr) { return arr.reduce((s, x) => s + x, 0) / arr.length; }
  function stddev(arr) { const m = avg(arr); return Math.sqrt(avg(arr.map((x) => (x - m) * (x - m)))); }

  return { buildCycles, analyzeCycle, cycleStats, ovulationOverview, isPeriod };
})();
