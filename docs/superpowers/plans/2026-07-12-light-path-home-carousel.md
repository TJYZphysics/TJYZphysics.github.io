# 光路寻踪与主页博文转盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“因果折纸”升级为包含 20 个可直接访问且全部可解关卡的“光路寻踪”，并完成主页中文标题和轨道式博文转盘改造。

**Architecture:** 游戏模型使用纯 TypeScript 的道具放置与分支光线模拟器，关卡数据与 UI 分离，每关内置可重放标准解。主页转盘从现有 Markdown 内容层读取文章，由独立 React 组件管理轮换、暂停与无障碍交互。

**Tech Stack:** React 19、TypeScript、Vite、React Router、Vitest、Testing Library、CSS/SVG。

## Global Constraints

- 纯静态 GitHub Pages，不新增后端或持久化。
- 20 个关卡全部直接开放，不保存进度。
- 每关标准解必须通过玩家相同的放置接口和模拟器验证成功。
- 最终必须执行单元测试、生产构建、浏览器人工逐关通关与桌面/移动端截图检查。
- Git 提交署名固定为 `TJYZphysics <194699225+TJYZphysics@users.noreply.github.com>`。

---

### Task 1: 光学道具与分支模拟模型

**Files:**
- Modify: `src/features/experiments/causalOrigami/model.ts`
- Modify: `src/features/experiments/causalOrigami/model.test.ts`

**Interfaces:**
- Produces: `ToolKind`, `Placement`, `ToolInventory`, `LightBranch`, `Level`, `placeTool()`, `runLevel()`。
- Consumes: 现有 `EventPoint`、`Direction`、`eventKey()` 坐标语义。

- [ ] **Step 1: 写失败测试**

新增测试，分别断言左右偏转器改变方向、分光棱镜同时保留入射方向并产生反向分支、库存耗尽拒绝放置、起点/目标/禁区拒绝放置、重复分支会去重。

```ts
it('splits one incoming branch into both directions', () => {
  const level = makeLevel({ inventory: { splitter: 1 } })
  const placed = placeTool(new Map(), { point: { x: 2, t: 1 }, tool: 'splitter' }, level)
  expect(placed.ok).toBe(true)
  const result = runLevel(level, placed.placements)
  expect(result.branchesForSource[0].some((branch) => branch.direction === -1)).toBe(true)
  expect(result.branchesForSource[0].some((branch) => branch.direction === 1)).toBe(true)
})
```

- [ ] **Step 2: 运行模型测试并确认因缺少新 API 失败**

Run: `npm test -- src/features/experiments/causalOrigami/model.test.ts`

- [ ] **Step 3: 实现最小模型**

把旧 `Map<string, Direction>` 改为 `Map<string, ToolKind>`。模拟时按光源分别维护前沿分支；每个时间步先移动，再应用事件点道具。`splitter` 产生左右方向，按 `source:x,t:direction` 去重。每个光源只要存在一条合法分支抵达目标即可成功。

- [ ] **Step 4: 运行模型测试并确认通过**

Run: `npm test -- src/features/experiments/causalOrigami/model.test.ts`

- [ ] **Step 5: 提交**

```bash
git add src/features/experiments/causalOrigami/model.ts src/features/experiments/causalOrigami/model.test.ts
git commit -m "feat: add optical tools and branching light model"
```

### Task 2: 20 个可解关卡

**Files:**
- Create: `src/features/experiments/causalOrigami/levels.ts`
- Create: `src/features/experiments/causalOrigami/levels.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Level`, `Placement`, `placeTool()`, `runLevel()`。
- Produces: `LIGHT_PATH_LEVELS: Level[]`, `replaySolution(level)`。

- [ ] **Step 1: 写失败的关卡完整性测试**

```ts
it('ships at least twenty uniquely numbered levels', () => {
  expect(LIGHT_PATH_LEVELS).toHaveLength(20)
  expect(new Set(LIGHT_PATH_LEVELS.map((level) => level.id)).size).toBe(20)
})

it.each(LIGHT_PATH_LEVELS)('$id standard solution is playable and succeeds', (level) => {
  const placements = replaySolution(level)
  expect(runLevel(level, placements)).toMatchObject({ legal: true, success: true })
})
```

- [ ] **Step 2: 运行测试并确认缺少关卡数据而失败**

Run: `npm test -- src/features/experiments/causalOrigami/levels.test.ts`

- [ ] **Step 3: 按答案先行方式编写 20 关**

所有关卡使用 9×8 棋盘和 `target.t === duration`。每关保存完整 `solution`；前 8 关只使用偏转器，第 9 关开始引入分光棱镜，第 17–20 关采用紧库存和非对称禁区。

- [ ] **Step 4: 增加坐标、库存和标准解合法性断言**

逐关检查 ID、序号、坐标、禁区重叠、库存使用量和 `placeTool()` 每一步返回值。

- [ ] **Step 5: 运行测试并确认 20 关全部通过**

Run: `npm test -- src/features/experiments/causalOrigami/levels.test.ts`

- [ ] **Step 6: 提交**

```bash
git add src/features/experiments/causalOrigami/levels.ts src/features/experiments/causalOrigami/levels.test.ts
git commit -m "feat: add twenty solvable light path levels"
```

### Task 3: 光路寻踪游戏界面

**Files:**
- Modify: `src/features/experiments/causalOrigami/CausalOrigamiGame.tsx`
- Modify: `src/features/experiments/causalOrigami/causalOrigami.css`
- Create: `src/features/experiments/causalOrigami/CausalOrigamiGame.test.tsx`
- Modify: `src/pages/ExperimentsPage.tsx`

**Interfaces:**
- Consumes: `LIGHT_PATH_LEVELS`, `ToolKind`, `placeTool()`, `runLevel()`。
- Produces: 全关卡选择、三工具库存、分支 SVG、切关重置和通关反馈。

- [ ] **Step 1: 写失败的组件测试**

测试页面显示“光路寻踪”、20 个直接可选关卡、三类道具；选择另一关后清空放置；运行标准解后显示“通关成功”。

- [ ] **Step 2: 运行组件测试并确认失败**

Run: `npm test -- src/features/experiments/causalOrigami/CausalOrigamiGame.test.tsx`

- [ ] **Step 3: 实现关卡选择与工具放置**

状态包含当前关卡索引、当前工具、放置 Map、撤销历史和运行结果。关卡按钮不含锁定逻辑。切关、上一关、下一关均调用统一 `selectLevel()` 清空局部状态。

- [ ] **Step 4: 实现多分支 SVG 与响应式样式**

根据模型返回的每条分支路径绘制 polyline；分光棱镜显示紫色菱形，左右偏转器显示箭头。关卡选择器桌面横向网格、移动端横向滚动。

- [ ] **Step 5: 更新实验名称与文案**

把所有用户可见“因果折纸”改为“光路寻踪”，实验副标题改为“镜片与棱镜”。保留内部目录名以避免无关路径重构。

- [ ] **Step 6: 运行组件测试和现有测试**

Run: `npm test`

- [ ] **Step 7: 提交**

```bash
git add src/features/experiments/causalOrigami src/pages/ExperimentsPage.tsx
git commit -m "feat: rebuild causal game as light path tracing"
```

### Task 4: 主页两行标题与博文轨道转盘

**Files:**
- Create: `src/components/PostCarousel.tsx`
- Create: `src/components/PostCarousel.test.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `getBlogPosts()` 和 `BlogPost`。
- Produces: `PostCarousel({ posts })`，支持循环导航、暂停、键盘和 reduced motion。

- [ ] **Step 1: 写失败的转盘测试**

测试 Markdown 文章标题均来自数据层；点击下一篇更新当前卡；左右键可切换；只有一篇时不显示导航；空数组显示空状态。

- [ ] **Step 2: 运行测试并确认组件不存在而失败**

Run: `npm test -- src/components/PostCarousel.test.tsx`

- [ ] **Step 3: 实现数据驱动转盘**

主页调用 `getBlogPosts().slice(0, 6)`。转盘只渲染必要位置，当前卡为主卡，前后卡缩放并降低透明度。7 秒自动轮换；hover、focus-within、document.hidden 和 reduced motion 时暂停。

- [ ] **Step 4: 实现边缘渐隐与响应式轨道**

容器同时设置 `mask-image` 和 `-webkit-mask-image`。位移 transform 放在轨道项，hover transform 放在卡片内层，避免覆盖。移动端保持当前卡可读、相邻卡少量露边。

- [ ] **Step 5: 修复标题字距**

把两行分别包裹为 `.hero-title-line`，使用轻微正字距和更宽松行高；移动端降低字号，保证 360px 宽度不溢出。

- [ ] **Step 6: 运行主页相关测试和全套测试**

Run: `npm test`

- [ ] **Step 7: 提交**

```bash
git add src/components/PostCarousel.tsx src/components/PostCarousel.test.tsx src/pages/HomePage.tsx src/styles/global.css
git commit -m "feat: add orbital homepage post carousel"
```

### Task 5: 全量验证、人工浏览器验收与发布

**Files:**
- Modify only if verification reveals defects.
- Add screenshots under ignored `screenshots/` for comparison evidence.

- [ ] **Step 1: 运行全套测试**

Run: `npm test`

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

- [ ] **Step 3: 启动生产预览**

Run: `npm run preview -- --host 127.0.0.1`

- [ ] **Step 4: 浏览器人工检查主页**

桌面和窄屏检查标题无重叠、转盘边缘渐隐、按钮/键盘切换、自动轮换暂停、文章链接正确，并保存前后截图。

- [ ] **Step 5: 浏览器逐关人工通关**

依次选择 1–20 关，按 `solution` 放置道具并点击运行，逐关确认“通关成功”。检查任意关卡可直接访问、切关清空状态、三类库存显示正确。

- [ ] **Step 6: 代码审查与差异检查**

Run: `git diff --check`、`git status --short`，复核无调试输出、无 Codex 署名、无截图被跟踪。

- [ ] **Step 7: 推送 GitHub**

优先使用已连接 GitHub 能力；若写权限不可用，则使用本地 TJYZphysics 凭据执行 `git push origin main`，必要时用浏览器人工完成。随后检查 Pages Actions 成功和线上页面返回 200。
