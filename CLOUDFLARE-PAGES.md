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

进入 Cloudflare Dashboard → Workers & Pages → `fengya` → Settings → Environment variables → Add variable。`DECAP_AUTH_BASE_URL` 至少要添加到 **Production**；如果要在 Preview 地址使用 CMS，也同时添加到 **Preview**。Cloudflare Pages 构建时会读取该变量并生成最终的 `/admin/config.yml`。

| 变量 | 示例 | 说明 |
|---|---|---|
| `NODE_VERSION` | `20` | 构建 Node 版本 |
| `TURNSTILE_SITE_KEY` | `0x4AAAA...` | Turnstile 公钥 |
| `FORM_ENDPOINT` | `https://form.example.com` | Worker 地址，不带 `/api/...` |
| `MEDIA_BASE` | 留空或 `https://assets.example.com` | 外部图片资源域名，可选 |
| `SITE_URL` | `https://www.example.com` | canonical / SEO 地址，可选 |
| `DECAP_AUTH_BASE_URL` | `https://form.example.com` | Decap GitHub OAuth Worker 地址；构建时注入 `/admin/config.yml`，不要写入代码 |

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

### 4.1 配置 CMS 的 GitHub 登录（Cloudflare Pages 必需）

Cloudflare Pages 不是 Netlify，Decap CMS 不能使用默认的 `api.netlify.com` 登录地址。本项目的同一个 Worker 同时提供表单接口和 Decap OAuth 代理：

1. 打开 GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**。
2. `Homepage URL` 填 Worker 地址，例如 `https://form.karfanjara.workers.dev`。
3. `Authorization callback URL` 填 `https://form.karfanjara.workers.dev/callback`。
4. 创建后把 Client ID 和 Client Secret 写入 Worker Secret（不要写进 GitHub 或 Pages 环境变量）：

   ```bash
   npx wrangler secret put GITHUB_OAUTH_ID --config worker/wrangler.toml
   npx wrangler secret put GITHUB_OAUTH_SECRET --config worker/wrangler.toml
   # fengya 是公开仓库时不需要；私有仓库再执行：
   npx wrangler secret put GITHUB_REPO_PRIVATE --config worker/wrangler.toml
   # 输入 1
   ```

5. 确认 `worker/wrangler.toml` 中的 `DECAP_CMS_ORIGIN` 是实际 CMS 地址（当前为 `https://fengya.pages.dev`），然后重新部署 Worker：

   ```bash
   npm run worker:deploy
   ```

   `public/admin/config.yml` 只保存模板；Cloudflare Pages 构建时从 `DECAP_AUTH_BASE_URL` 注入 `base_url` 和 `auth_endpoint: /auth`，因此登录时不会再请求 `api.netlify.com`。

如果你的 Worker 不是示例地址，请只修改 Cloudflare Pages 的 `DECAP_AUTH_BASE_URL`、`FORM_ENDPOINT` 和 GitHub OAuth App 的两个 URL；不要修改模板里的 `base_url`。

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
- `/admin/` → GitHub 登录弹窗应跳转到 Worker，再回到 CMS；不应出现 `api.netlify.com/auth`。

本地 CMS 调试仍使用：

```bash
npm run dev:all
```

然后直接访问 `http://localhost:4321/admin/`，无需 GitHub 登录。

## 八、无法安装 GitHub/GitLab 账户时

如果 Cloudflare 提示：`Cloudflare Pages 无法安装在您的 GitHub/GitLab 帐户上。请尝试完全卸载之前的安装，然后重新安装。`，按以下顺序处理：

1. 登录 GitHub，打开个人账户的 [Installed GitHub Apps](https://github.com/settings/installations)。如果仓库属于 Organization，则打开 `https://github.com/organizations/组织名/settings/installations`。
2. 找到 **Cloudflare Workers and Pages**，进入 `Configure`，滚动到底部选择 `Uninstall`。
3. 回到 Cloudflare 控制台，进入 `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`。
4. 点击 `Add account`，重新选择正确的 GitHub 个人账户或 Organization，然后选择 `Install & Authorize`。
5. GitHub 的 Repository access 选择 `Only select repositories`，确保包含 `wongkimhung/fengya`，或你的实际仓库名。
6. 回到 Pages 创建流程，重新选择仓库和 `main` 分支。

注意：GitHub 的 `Repository access` 页面只负责授权 Cloudflare 访问仓库，不会显示 Pages 的分支、构建命令或输出目录。完成这里的 `Save` 后，必须回到 Cloudflare 控制台继续 `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`；分支和 Build settings 会在 Cloudflare 的创建项目流程中出现。

如果仓库属于 Organization，必须由 Organization Owner 或拥有 GitHub Apps Manager 权限的成员完成安装；如果 Organization 开启了第三方 App 审批，还需要管理员批准 Cloudflare App。

仍然失败时继续检查：

- GitHub App 是否处于 `Suspended` 状态；如是，在 Configure 页面执行 `Unsuspend`。
- 该仓库是否已经连接到另一个 Cloudflare 账户下的 Pages 项目；同一个 Git 仓库不能同时用于不同 Cloudflare 账户的 Pages Git 集成，需要先断开或删除旧项目。
- GitHub App 的 Repository access 是否排除了目标仓库。
- 退出 GitHub 和 Cloudflare，使用无痕窗口重新授权，避免旧 OAuth 会话干扰。

重新安装 GitHub App 后，不要选择 Direct Upload；本项目需要保持 Git integration，这样 GitHub 的 `main` 提交才能自动触发 Pages 构建。
