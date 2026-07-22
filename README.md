# TJYZ Physics Official Website

TJYZ Physics 物理社官网，包含主页、Markdown 博客、七个浏览器互动实验与社团介绍。

## 本地开发

```bash
npm install
npm run dev
```

运行测试与生产构建：

```bash
npm test
npm run build
```

## 发布博客

只需在 `/blog` 新增 UTF-8 Markdown 文件，无需修改前端代码。推荐 front matter：

```markdown
---
title: 文章标题
date: 2026-07-12
summary: 一句话摘要
tags: [标签一, 标签二]
---

# 正文
```

推送到 `main` 后，GitHub Actions 会自动测试、构建并部署 GitHub Pages。

## About us 内容

- `/about/introduction.md`：社团介绍
- `/about/history.md`：社团历史

两份文件均由页面直接读取 Markdown 内容。
