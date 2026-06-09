# 体温计

一个**私密、离线、自动判读**的基础体温与周期记录小程序（PWA）。
所有数据只保存在你手机本地，**绝不上传任何服务器**。

## 功能

- **基础体温曲线（核心）**：每天记录晨起体温，自动画双相曲线、画覆盖线、用「三天高温法则」判断排卵日，并给一句白话结论。
- **月经周期**：记录经期与经量，自动统计周期/黄体期长度，预测下次月经与易孕窗口。
- **排卵试纸 LH**、**宫颈黏液**、**同房记录**：全部叠加到体温曲线和日历上，互相印证易孕窗口。
- **数据备份**：一键导出/导入 JSON，换手机不丢数据。

## 在电脑上预览

PWA 用到的模块和 Service Worker 需要通过 http(s) 访问，不能直接双击打开 `index.html`。在本目录下起一个静态服务器即可：

```bash
cd 温度计
python3 -m http.server 8000
```

浏览器打开 http://localhost:8000 。用 Chrome 开发者工具的「设备模拟」切到 iPhone 视图体验。

## 装到 iPhone 上（推荐：GitHub Pages，免费）

> 托管的只是**程序代码**；你记录的体温/月经数据始终留在手机浏览器本地，不在仓库里。

1. 新建一个 GitHub 仓库，把本目录所有文件传上去。
2. 仓库 **Settings → Pages → Build and deployment → Source 选 “Deploy from a branch”**，分支选 `main`、目录 `/ (root)`，保存。
3. 等一两分钟，会得到一个网址，形如 `https://你的用户名.github.io/仓库名/`。
4. 用 **iPhone 的 Safari** 打开这个网址 → 点底部「分享」按钮 → **添加到主屏幕**。
5. 主屏幕上就有了「体温计」图标，点开是全屏、可离线使用的 App。

命令行推送示例：

```bash
cd 温度计
git init && git add . && git commit -m "init 体温计 app"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

## 使用建议

- 每天**晨起、起床前、同一时间**测体温（口腔/舌下最稳），数据才准。
- 看到试纸**强阳**、黏液**蛋清拉丝**时，通常临近排卵，可安排同房。
- 排卵后体温升高、连续 3 天高于覆盖线 → 曲线页会确认排卵并标出排卵日。
- 判读结果仅供参考，**不能替代医生诊断**。

## 数据与隐私

- 数据存于浏览器 IndexedDB（本机），不联网、不上传。
- 清除浏览器数据或卸载会丢失记录，请定期到「设置 → 导出备份」保存文件。

## 文件结构

```
index.html          页面骨架 + 底部导航
app.css             样式
js/store.js         本地存储（IndexedDB）+ 导出/导入
js/cycle.js         周期/排卵/覆盖线/双相/黄体期 算法（纯函数）
js/chart.js         手写 SVG 体温曲线
js/views.js         记录/曲线/日历/设置 四个页面
js/app.js           入口、标签切换、注册 Service Worker
manifest.json       PWA 清单
service-worker.js   离线缓存
icons/              主屏图标
```
