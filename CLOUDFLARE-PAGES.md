# GitHub + Cloudflare Pages 部署教程

本项目推荐的生产结构：

```text
GitHub main
   ├── Cloudflare Pages：npm run build → dist/
   └── Cloudflare Worker：表单接口 /api/contact、/api/quote、/api/translate
```

文章、翻译、产品、项目和 JSON 配置全部保存在 GitHub 仓库，不使用外部 CMS 数据库。

## 一、推送代码到 GitHub

如果还没有远程仓库：

```bash
git remote add origin git@github.com:你的用户名/你的仓库.git
git branch -M main
git push -u origin main
```

日常发布：

```bash
git add .
git commit -m "update website"
git push origin main
```

如果 CMS 已经配置 GitHub backend，那么在 `/admin/` 点击 Publish 后会直接产生 Git commit，不需要手动执行上面的命令。

## 二、创建 Cloudflare Pages 项目

在 Cloudflare 控制台进入：`Workers & Pages` → `Create application` → `Pages` → `Connect to Git`。

选择 GitHub 仓库和 `main` 分支，构建设置如下：

| 配置项 | 值 |
|---|---|
| Framework preset | Astro，或 None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node.js version | `20` |

首次部署完成后，Cloudflare 会提供一个 `*.pages.dev` 地址。之后每次推送到 `main`，Pages 会自动构建并发布。

## 三、配置 Pages 环境变量

在 Pages 项目 → Settings → Environment variables 中配置 Production 和 Preview：

| 变量 | 示例 | 说明 |
|---|---|---|
| `NODE_VERSION` | `20` | 构建 Node 版本 |
| `TURNSTILE_SITE_KEY` | `0x4AAAA...` | Turnstile 公钥 |
| `FORM_ENDPOINT` | `https://form.example.com` | Worker 地址，不带 `/api/...` |
| `MEDIA_BASE` | 留空或 `https://assets.example.com` | 外部图片资源域名，可选 |
| `SITE_URL` | `https://www.example.com` | canonical / SEO 地址，可选 |

不要把 `TURNSTILE_SECRET_KEY`、`GOOGLE_TRANSLATE_API_KEY`、Resend Key 等私钥配置到 Pages；它们只属于 Worker Secret。

## 四、部署独立 Worker

先登录 Wrangler：

```bash
npx wrangler login
```

如启用报价记录，创建 KV 并把返回的 ID 写入 `worker/wrangler.toml`：

```bash
npx wrangler kv namespace create QUOTES
```

配置 Worker Secret：

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY --config worker/wrangler.toml
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY --config worker/wrangler.toml
# 以下为可选通知配置
npx wrangler secret put NOTIFY_URL --config worker/wrangler.toml
npx wrangler secret put RESEND_API_KEY --config worker/wrangler.toml
npx wrangler secret put RESEND_FROM_EMAIL --config worker/wrangler.toml
npx wrangler secret put QUOTE_NOTIFY_TO --config worker/wrangler.toml
```

部署 Worker：

```bash
npm run worker:deploy
# 或
bash scripts/deploy-worker.sh
```

把 Worker 返回的 `workers.dev` 地址填入 Pages 的 `FORM_ENDPOINT`。如果绑定自定义域名，例如 `form.example.com`，则使用自定义域名。

## 五、使用一键 Pages 部署脚本（可选）

Cloudflare Pages 已连接 GitHub 时不需要脚本。若要从本地或 CI 手动上传：

```bash
npx wrangler login
export CF_PAGES_PROJECT=你的-pages-项目名
export CF_PAGES_BRANCH=main
bash scripts/deploy-pages.sh
```

脚本会执行 `npm ci`、`npm run build`，然后把 `dist/` 上传到 Cloudflare Pages。

## 六、域名绑定

Cloudflare Pages → Custom domains → Set up a custom domain，绑定正式域名。DNS 由 Cloudflare 管理时通常会自动创建记录并签发 SSL。

建议：

- 主站：`www.example.com`
- Worker：`form.example.com`
- 本地预览：Cloudflare 提供的 `*.pages.dev`

## 七、上线检查

```bash
npm run build
```

上线后检查：

- `/`、`/zh/`、`/es/`
- `/products/aluminis-karfanjara/`
- `/admin/`
- `/search-index.json`
- 联系表单和报价表单
- `/admin/translator/`

本地 CMS 调试仍使用：

```bash
npm run dev:all
```

然后直接访问 `http://localhost:4321/admin/`，无需 GitHub 登录。
