/*
 * icons.js — 内嵌 Lucide 风格图标（极简细线，MIT）。完全离线，不依赖任何外部库。
 *   Icons.svg(name, opts)  线性图标（标签栏等）
 *   Icons.heart/tri/dia    填充小标记（图例 / 日历）
 */
window.Icons = (function () {
  // Lucide 原始 path（24x24，stroke 线性）
  const P = {
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
    heartPath: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  };

  function svg(name, opts) {
    opts = opts || {};
    const size = opts.size || 22, color = opts.color || 'currentColor', stroke = opts.stroke || 2;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" ` +
      `stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  }

  // 填充小标记（图例、日历用）
  function heart(size, color) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" style="vertical-align:-2px"><path d="${P.heartPath}"/></svg>`;
  }
  function tri(size, color) {
    return `<svg viewBox="0 0 10 10" width="${size}" height="${size}" style="vertical-align:-1px"><polygon points="5,1 9,9 1,9" fill="${color}"/></svg>`;
  }
  function dia(size, color) {
    return `<svg viewBox="0 0 10 10" width="${size}" height="${size}" style="vertical-align:-1px"><polygon points="5,1 9,5 5,9 1,5" fill="${color}"/></svg>`;
  }

  return { svg, heart, tri, dia, P };
})();
