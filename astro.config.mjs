// @ts-check
import { defineConfig } from 'astro/config';

// Enterprise Portal Website — Astro (Jamstack) + Decap CMS + Cloudflare Pages/R2
// Build output goes to dist/, managed by Cloudflare Pages (no server runtime needed).
export default defineConfig({
  // 不写死固定域名：本站会部署到 Cloudflare Pages / EdgeOne Pages 等多个平台。
  // 需要绝对 URL（如 SEO canonical）时，在构建端设置环境变量 SITE_URL（如 https://www.example.com）。
  site: process.env.SITE_URL || undefined,
  // Multilingual routing: default locale 'en' at root path, Chinese at /zh/ and Spanish at /es/
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh', 'es'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  // 表单接口不再走 Pages Function：由独立 Worker（worker/）提供 /api/contact 与 /api/quote，
  // Cloudflare Pages 与腾讯云 EdgeOne Pages 两个静态站点共用该 Worker 地址（见 src/consts.ts formEndpoint）。
  // 本地预览时若无 Worker，表单可临时关掉 Turnstile 校验（不配置 TURNSTILE_SECRET_KEY 即跳过）。
});
