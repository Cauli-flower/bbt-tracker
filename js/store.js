/*
 * store.js — 本地数据存储
 * 所有数据保存在手机浏览器本地（IndexedDB），绝不上传任何服务器。
 *
 * 每日记录的数据结构（一天一条，按日期 YYYY-MM-DD 作为主键）：
 *   {
 *     date:        "2026-06-09",          // 主键
 *     temp:        36.45 | null,          // 基础体温 ℃
 *     tempTime:    "06:30" | "",          // 测量时间（可选）
 *     period:      "none|light|medium|heavy",  // 经量；none = 非经期
 *     lh:          "none|negative|weak|strong|fading", // 排卵试纸
 *     mucus:       "none|dry|wet|slippery|sticky|creamy|eggwhite",  // 宫颈黏液（wet/slippery=按感觉记，slippery≈最易孕）
 *     intercourse: true | false,          // 同房
 *     note:        ""                     // 备注/心情
 *   }
 *
 * 设置（周期长度等校准值）保存在 localStorage。
 */
window.Store = (function () {
  const DB_NAME = 'thermo-db';
  const DB_VER = 2;
  const STORE = 'days';
  const PHOTOS = 'lhphotos';        // 试纸照片：{ date, img(压缩后的dataURL) }
  const SETTINGS_KEY = 'thermo-settings';

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains(PHOTOS)) {
          db.createObjectStore(PHOTOS, { keyPath: 'date' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, store) {
    store = store || STORE;
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  // 读取某一天（不存在则返回 null）
  function getDay(date) {
    return tx('readonly').then((os) => new Promise((res, rej) => {
      const r = os.get(date);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }

  // 写入/更新某一天
  function putDay(record) {
    return tx('readwrite').then((os) => new Promise((res, rej) => {
      const r = os.put(record);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  }

  // 删除某一天
  function deleteDay(date) {
    return tx('readwrite').then((os) => new Promise((res, rej) => {
      const r = os.delete(date);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  }

  // 取全部记录，按日期升序
  function allDays() {
    return tx('readonly').then((os) => new Promise((res, rej) => {
      const r = os.getAll();
      r.onsuccess = () => {
        const list = (r.result || []).sort((a, b) => a.date < b.date ? -1 : 1);
        res(list);
      };
      r.onerror = () => rej(r.error);
    }));
  }

  // ---------- 试纸照片 ----------
  function putPhoto(date, img) {
    return tx('readwrite', PHOTOS).then((os) => new Promise((res, rej) => {
      const r = os.put({ date, img });
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  }
  function getPhoto(date) {
    return tx('readonly', PHOTOS).then((os) => new Promise((res, rej) => {
      const r = os.get(date);
      r.onsuccess = () => res(r.result ? r.result.img : null);
      r.onerror = () => rej(r.error);
    }));
  }
  function deletePhoto(date) {
    return tx('readwrite', PHOTOS).then((os) => new Promise((res, rej) => {
      const r = os.delete(date);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }));
  }
  // 取全部照片，返回 { date: img } 映射
  function allPhotos() {
    return tx('readonly', PHOTOS).then((os) => new Promise((res, rej) => {
      const r = os.getAll();
      r.onsuccess = () => { const m = {}; (r.result || []).forEach((p) => { m[p.date] = p.img; }); res(m); };
      r.onerror = () => rej(r.error);
    }));
  }

  // ---------- 设置 ----------
  const DEFAULT_SETTINGS = {
    avgCycle: 28,      // 平均周期长度（天），用于预测
    avgLuteal: 14,     // 平均黄体期长度（天），用于反推排卵
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(getSettings(), s)));
  }

  // ---------- 导出 / 导入 ----------
  function exportAll() {
    return allDays().then((days) => ({
      app: 'thermo-log',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      days,
    }));
  }

  // 导入：合并模式（覆盖同日期记录），返回导入条数
  function importAll(data) {
    if (!data || !Array.isArray(data.days)) {
      return Promise.reject(new Error('文件格式不正确'));
    }
    if (data.settings) saveSettings(data.settings);
    return tx('readwrite').then((os) => new Promise((res, rej) => {
      let n = 0;
      data.days.forEach((d) => { if (d && d.date) { os.put(d); n++; } });
      os.transaction.oncomplete = () => res(n);
      os.transaction.onerror = () => rej(os.transaction.error);
    }));
  }

  // 清空全部（设置页"重置"用）：每日记录 + 试纸照片一起清
  function clearAll() {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction([STORE, PHOTOS], 'readwrite');
      t.objectStore(STORE).clear();
      t.objectStore(PHOTOS).clear();
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    }));
  }

  return {
    getDay, putDay, deleteDay, allDays,
    putPhoto, getPhoto, deletePhoto, allPhotos,
    getSettings, saveSettings,
    exportAll, importAll, clearAll,
  };
})();
