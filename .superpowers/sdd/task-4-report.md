# Task 4 Report: 主页两行标题与博文轨道转盘

## 状态

完成。主页标题已显式拆成两行；最近博文改为由 `getBlogPosts().slice(0, 6)` 驱动的轨道式转盘。

## TDD 记录

- 红灯：`npm test -- src/components/PostCarousel.test.tsx` 因 `PostCarousel` 尚不存在而失败。
- 绿灯：实现后目标测试 10/10 通过。
- 覆盖：数据标题与链接、前后按钮、方向键、分页圆点、0/1 篇、7 秒自动轮换，以及 hover、focus、`document.hidden`、reduced motion 暂停。

## 实现摘要

- 转盘仅渲染当前及必要相邻卡；当前仅两篇文章时渲染两个唯一卡片并循环切换，不复制可聚焦内容。
- 当前、前、后卡沿浅弧缩放/降透明度；视口同时使用 `mask-image` 和 `-webkit-mask-image` 渐隐左右边缘。
- 无封面时根据 slug 与标签稳定选择深蓝、青色或紫色渐变。
- 主页标题使用 `.hero-title-line` 和轻微正字距；360px 断点降低字号并放宽行高。

## 验证

- `npm test -- src/components/PostCarousel.test.tsx`：1 文件、10 测试通过。
- `npm test`：9 文件、90 测试通过。
- `npm run build`：TypeScript 与 Vite 生产构建通过。
- `git diff --check`：通过。

## 关注点

- 已按前端验收流程尝试连接本地 `http://127.0.0.1:4173/`，但浏览器运行时返回可用浏览器列表为空，因此本任务未能保存桌面/360px 截图或执行真实浏览器交互。响应式与暂停行为已由 CSS 约束和组件测试覆盖，仍建议 Task 5 在可用浏览器环境补做视觉验收。

## 审查修复

- 测试套件在模块加载时缓存原始 `document.hidden` descriptor 与 `window.matchMedia`，并在每个测试后完整恢复，避免全局环境泄漏至其他测试文件。
- 新增恰好 2 篇文章的回归测试，断言仅渲染两个唯一 article/link，并验证前进、后退及连续两次自动轮换时标题和 `01/02` 序号同步循环。
