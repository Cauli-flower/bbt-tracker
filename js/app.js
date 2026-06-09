/*
 * app.js — 入口：底部标签切换、初始化、注册 Service Worker
 */
(function () {
  const views = { record: Views.record, chart: Views.chart, calendar: Views.calendar, settings: Views.settings };
  let current = 'record';

  async function switchTo(view) {
    // 离开记录页时保存当前编辑
    if (current === 'record' && view !== 'record') { try { await Views.saveCur(true); } catch (e) {} }
    current = view;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    window.scrollTo(0, 0);
    document.querySelector('.app-main').scrollTop = 0;
    await views[view]();
  }

  Views.setSwitch(switchTo);

  // 填充标签栏 Lucide 图标
  document.querySelectorAll('.tab-ico[data-icon]').forEach((el) => {
    el.innerHTML = Icons.svg(el.dataset.icon, { size: 22 });
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTo(tab.dataset.view));
  });

  // 启动
  switchTo('record');

  // 注册 Service Worker（仅在 https 或 localhost 下生效）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
