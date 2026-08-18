#!/usr/bin/env bash
set -euo pipefail

# 手动部署到 Cloudflare Pages。
# 推荐生产环境直接在 Cloudflare Pages 连接 GitHub；本脚本适合临时预览或没有启用 Git 自动部署时使用。

PROJECT_NAME="${CF_PAGES_PROJECT:?请先设置 CF_PAGES_PROJECT，例如 export CF_PAGES_PROJECT=karfanjara}"
BRANCH="${CF_PAGES_BRANCH:-main}"

echo "==> Installing dependencies"
npm ci

echo "==> Building Astro site"
npm run build

echo "==> Deploying dist/ to Cloudflare Pages project: ${PROJECT_NAME}"
npx wrangler pages deploy dist --project-name "${PROJECT_NAME}" --branch "${BRANCH}"

echo "==> Cloudflare Pages deployment finished"
