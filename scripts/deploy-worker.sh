#!/usr/bin/env bash
set -euo pipefail

# 独立部署表单 / 翻译 Worker。Worker 的 Secret 需要提前用 wrangler secret put 配置。
npx wrangler deploy --config worker/wrangler.toml
