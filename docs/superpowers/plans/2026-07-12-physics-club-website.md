# TJYZ Physics Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the complete TJYZ Physics club website with four modules, automatic Markdown discovery, and three fully interactive browser experiments.

**Architecture:** A React and TypeScript Vite SPA uses route-level pages and focused feature modules. Markdown is discovered at build time with `import.meta.glob`; simulation math is separated from Canvas rendering so invariant behavior is testable.

**Tech Stack:** React 19, TypeScript, Vite, React Router, react-markdown, gray-matter, remark-gfm, Vitest, Canvas 2D, CSS modules/global design tokens, GitHub Actions Pages.

## Global Constraints

- All visible Chinese text and Markdown files use UTF-8.
- Adding a Markdown file under `blog/` must require no frontend source edit.
- About introduction and history remain Markdown and contain no personal names or identifying details.
- All experiments are frontend-only and must support complete start, pause/result, reset flows.
- Manual browser operation and screenshot inspection are mandatory before deployment.
- Commits must use the TJYZphysics identity.

---

### Task 1: Foundation and Content Pipeline

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/content/content.ts`, `src/content/content.test.ts`, `blog/welcome.md`, `about/introduction.md`, `about/history.md`.

**Interfaces:** `getBlogPosts(): BlogPost[]`, `getAboutDocument(kind): MarkdownDocument`, with normalized metadata and raw Markdown body.

- [ ] Write tests for date sorting, filename title fallback, UTF-8 Chinese content, and missing optional metadata.
- [ ] Run the focused test and confirm failure because the content module is missing.
- [ ] Implement Vite glob discovery and normalized content types.
- [ ] Run tests and confirm all content cases pass.
- [ ] Configure base app routing and commit the independently buildable foundation.

### Task 2: Global Shell and Home Page

**Files:** Create `src/styles/tokens.css`, `src/styles/global.css`, `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx`, `src/components/OrbitalField.tsx`, `src/pages/HomePage.tsx`.

**Interfaces:** Shared shell wraps route content; `OrbitalField` renders decorative pointer-responsive Canvas with reduced-motion fallback.

- [ ] Write component tests for navigation labels, mobile menu state and reduced-motion fallback.
- [ ] Confirm tests fail before components exist.
- [ ] Implement the shared shell and polished home sections using the approved visual specification.
- [ ] Run component tests and a production build.
- [ ] Commit the home experience.

### Task 3: Blog Notebook and Markdown Reader

**Files:** Create `src/pages/BlogPage.tsx`, `src/pages/BlogPostPage.tsx`, `src/components/MarkdownArticle.tsx`, `src/features/reactions/useLocalReaction.ts`, related tests and styles.

**Interfaces:** Blog list consumes `BlogPost[]`; reader resolves a slug and renders Markdown; reaction hook persists a namespaced boolean and count seed.

- [ ] Write failing tests for automatic article listing, unknown slugs, safe external links and persistent reactions.
- [ ] Implement notebook list, article reader, empty/not-found states, Markdown typography and local reaction feedback.
- [ ] Run tests and production build.
- [ ] Commit the complete blog module.

### Task 4: Three-Body Simulator

**Files:** Create `src/features/experiments/threeBody/physics.ts`, `physics.test.ts`, `ThreeBodyLab.tsx`, and styles.

**Interfaces:** `stepSystem(bodies, dt, gravity, softening): Body[]`, `centerOfMass(bodies): Vector`, preset factories returning deterministic body arrays.

- [ ] Write failing tests for finite integration, momentum stability, center of mass and preset isolation.
- [ ] Implement math functions until tests pass.
- [ ] Implement Canvas rendering, trails, presets, sliders, pause, step and reset controls.
- [ ] Run all tests and build, then commit.

### Task 5: Collision Simulator

**Files:** Create `src/features/experiments/collision/collision.ts`, `collision.test.ts`, `CollisionLab.tsx`, and styles.

**Interfaces:** `solveCollision(input): CollisionResult` returns final velocities, momentum delta and energy delta.

- [ ] Write failing tests for elastic equal masses, unequal masses, perfectly inelastic collision and momentum conservation.
- [ ] Implement the collision solver until tests pass.
- [ ] Implement animated blocks, live metrics and complete start/pause/reset/result flow.
- [ ] Run all tests and build, then commit.

### Task 6: Original Causal Origami Game

**Files:** Create `src/features/experiments/causalOrigami/model.ts`, `model.test.ts`, `CausalOrigamiGame.tsx`, and styles.

**Interfaces:** `simulateLevel(level, folds): SimulationResult` returns both signal paths, legality, meeting event and reason; fold editing is immutable.

- [ ] Write failing tests for light-cone movement, fold deflection, forbidden cells, meeting success and fold budget.
- [ ] Implement the deterministic model until tests pass.
- [ ] Implement grid interaction, fold placement/removal, run animation, reset, rules and result feedback.
- [ ] Run all tests and build, then commit.

### Task 7: Experiments Hub and Swiss About Page

**Files:** Create `src/pages/ExperimentsPage.tsx`, `src/pages/AboutPage.tsx`, `src/components/GiscusPlaceholder.tsx`, and page styles.

**Interfaces:** Experiments page switches between three labs without overlapping canvases; About consumes both Markdown documents through the shared renderer with an alternate theme.

- [ ] Write failing route and interaction tests for all three experiment tabs and both About documents.
- [ ] Implement the tactile glass instrument hub and Swiss International About layout.
- [ ] Add local likes and a non-erroring Giscus configuration placeholder.
- [ ] Run all tests and build, then commit.

### Task 8: Deployment and Manual Visual Verification

**Files:** Create `.github/workflows/deploy.yml`, `public/404.html`; update `README.md` and any styles identified during review.

**Interfaces:** Pushes to the default branch run install, test, build and Pages deployment.

- [ ] Run the full unit test suite and production build with pristine output.
- [ ] Start the local preview and manually inspect home, blog, article, experiments and About at desktop and mobile widths.
- [ ] Operate every experiment through its full control loop and capture screenshots.
- [ ] Fix each visual or interaction defect, re-run tests/build, and repeat screenshot inspection.
- [ ] Commit with TJYZphysics identity, publish through the GitHub workflow, and verify the live Pages URL.

