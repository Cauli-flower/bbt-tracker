/*
 * app.js — 入口：底部标签切换、初始化、注册 Service Worker
 */
window.APP_VERSION = 'v6';   // 与 service-worker 缓存版本同步，显示在设置页便于确认更新
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

  // 注册 Service Worker，并做"自动更新"：发现新版自动重载（解决桌面 PWA 不能下拉刷新）
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;       // 新 SW 接管后自动刷新一次，拿到最新内容
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').then((reg) => {
        reg.update();               // 启动即检查更新
        // 回到前台时再查一次（桌面 PWA 常常是恢复而非重新加载）
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) reg.update();
        });
      }).catch(() => {});
    });
  }
})();
