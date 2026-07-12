# Task 3 实施报告：光路寻踪游戏界面

署名：TJYZphysics

## 状态

已完成。Task 3 指定的游戏界面已从“因果折纸”重建为“光路寻踪”，未修改模型与关卡数据文件。

## 改动范围

- `src/features/experiments/causalOrigami/CausalOrigamiGame.tsx`
- `src/features/experiments/causalOrigami/causalOrigami.css`
- `src/features/experiments/causalOrigami/CausalOrigamiGame.test.tsx`
- `src/pages/ExperimentsPage.tsx`

## TDD 记录

1. 先新增组件测试，覆盖新标题、20 关直接选择、三工具库存、切关清空、标准解成功反馈。
2. 首次运行目标测试：3 个用例全部失败，失败原因与旧界面缺少新功能一致。
3. 完成实现后目标测试通过；自审补充第 20 关直接访问和分光 SVG 测试，最终 4 个用例全部通过。

## 实现摘要

- 全部 20 关始终显示并可直接选择，无锁定逻辑。
- 统一 `selectLevel()` 处理关卡按钮、上一关、下一关和成功快捷入口，切关会清空放置、撤销历史与运行结果。
- 三类工具卡展示 Lucide 图标、名称、用途和实时剩余库存。
- 棋盘使用公开 `placeTool()` 放置道具，使用 `runLevel()` 运行，与关卡标准解测试走同一模型接口。
- SVG 绘制模型返回的全部分支，按光源使用青色/紫色；次级分支降低透明度，抵达目标的分支保持高亮。
- 成功状态显示绿色“通关成功”反馈和“进入下一关”按钮。
- 桌面采用工具台加棋盘布局；移动端改为纵向布局、横向滚动关卡条和紧凑工具卡。
- 页面入口文案更新为“光路寻踪 / 镜片与棱镜”，内部目录名保持不变。
- 首尾时间边界的非特殊事件点在 UI 中禁用，避免放置不会参与模拟的道具。

## 验证

- `npm test -- src/features/experiments/causalOrigami/CausalOrigamiGame.test.tsx`：通过，4/4。
- `npm test`：通过，8 个测试文件、80/80。
- `npm run build`：通过，TypeScript 与 Vite 生产构建成功。
- `git diff --check`：通过。

## 自审

- React 状态保持在游戏组件内，派生库存与棋盘点使用稳定依赖计算；静态工具元数据提升到模块级。
- 关卡切换通过单一入口重置状态，避免按钮、上一关和下一关出现不一致行为。
- 所有交互按钮有明确 accessible name，选中态使用 `aria-pressed`，反馈通过独立 live region 宣告。
- 工具、目标、光源和禁区同时使用形状、图标或文字语义，不仅依赖颜色区分。
- `prefers-reduced-motion` 下关闭光路动画与过渡。

## 关注点

- 内置浏览器运行时已连接检查，但当前环境返回可用浏览器列表为空；项目也未安装 Playwright，因此本次无法生成桌面与移动端截图或完成真实浏览器点击验收。组件级交互由 Testing Library 覆盖，仍建议在可用浏览器环境补一次 1280px 与 360px 视觉检查。
- 模型固定输出分光方向集合，未携带谱系层级；UI 只能基于分支顺序标记次级分支。为避免误导，所有抵达目标的分支都会保持完整亮度。
