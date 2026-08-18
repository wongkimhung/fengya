# 部署指南 (DEPLOY)

> 如果只需要“GitHub 托管代码 + Cloudflare Pages 托管页面”，请直接阅读 [CLOUDFLARE-PAGES.md](./CLOUDFLARE-PAGES.md)。其中包含 GitHub 自动部署、环境变量、Worker 和可选一键脚本。

> 目标：将本 Astro 静态门户**双活部署**到 **Cloudflare Pages（海外）** 与 **腾讯云 EdgeOne Pages（中国大陆）**，共用一套 GitHub 仓库与内容；表单逻辑由**独立 Cloudflare Worker** 统一承担（两个平台都能跑纯静态，但 Pages Function 只在 Cloudflare 生效，故抽离为通用接口）。全程零服务器运维。

架构：`GitHub 仓库 → Cloudflare Pages（海外 CDN）` + `GitHub 仓库 → 腾讯云 EdgeOne Pages（国内 CDN）`；资源走 R2（海外）与 COS（国内）双份；表单走独立 Worker（`worker/`）的 `/api/contact` 与 `/api/quote`。

```
Decap CMS ──▶ GitHub（唯一内容源）
                 │ 两端平台各自连接仓库自动构建
                 ├─▶ Cloudflare Pages ──▶ 海外访问（www 域名）
                 └─▶ 腾讯云 EdgeOne Pages ─▶ 国内访问（备案域名）
表单前端 ──▶ 独立 Cloudflare Worker（/api/contact · /api/quote）
```

---

## 1. 前置条件
- 一个 GitHub 仓库，代码已推送。
- 一个 Cloudflare 账号（免费版即可）与一个腾讯云账号。
- **ICP 备案域名**（中国大陆站点必须备案才能绑定自定义域名）。
- 已申请 **Turnstile** 站点（Cloudflare 控制台 → Turnstile）：获得**站点密钥**（公开）与**私钥**。
- （可选）Resend 账号用于报价邮件通知。

---

## 2. 独立 Worker：表单接口（先部署这个）
表单不依赖任一站点平台，先部署 Worker，拿到地址后两端站点共用。

1. **创建 KV 命名空间**（报价记录存储）：
   ```bash
   npx wrangler kv namespace create QUOTES
   ```
   把输出的 `id` 填入 `worker/wrangler.toml` 的 `[[kv_namespaces]]`。

2. **配置敏感变量**（勿写入仓库）：
   ```bash
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put NOTIFY_URL            # 可选：联系表单 Webhook 转发
   npx wrangler secret put RESEND_API_KEY        # 可选：报价邮件
   npx wrangler secret put RESEND_FROM_EMAIL     # 可选：已验证发件邮箱
   npx wrangler secret put QUOTE_NOTIFY_TO       # 可选：报价接收邮箱
   ```

3. **部署**：
   ```bash
   npm run worker:deploy        # = wrangler deploy --config worker/wrangler.toml
   ```
   成功后得到 `https://karfanjara-form.<你的子域>.workers.dev`。

4. **（推荐）绑定自定义域名**：Workers → 你的 Worker → 设置 → 域名，绑定 `form.karfanjara.ge`（需 DNS 加 CNAME 指向对应路由），同时把 `wrangler.toml` 中注释掉的 `[routes]` 打开。

5. **本地联调**：`npm run worker:dev` 后，用 `curl -X POST http://127.0.0.1:8787/api/contact -d '{"name":"t","phone":"1","message":"hi"}'` 验证返回 `{"ok":true}`。

---

## 3. 站点构建配置（两端一致）

### 3.1 Cloudflare Pages（海外）
1. **Workers & Pages → 创建 → Pages → 连接到 Git**，选仓库与分支（如 `main`）。
2. 构建：**命令** `npm run build`，**输出目录** `dist`，Node ≥ 20。
3. 自定义域名：绑定 `www.karfanjara.ge` 等（DNS 托管在 Cloudflare，SSL 选 Full (Strict)）。

### 3.2 腾讯云 EdgeOne Pages（中国大陆）
1. EdgeOne → Pages → 创建 → 从 GitHub 导入同一仓库（无需改造代码）。
2. 构建：命令 `npm run build`，输出目录 `dist`。
3. **加速区域选择「中国大陆」**，绑定**已备案**域名（需在腾讯云完成备案接入）。
4. EdgeOne 不解析 `functions/`，本仓库已移除该目录；表单由第 2 节独立 Worker 提供，两端天然一致。

### 3.3 站点环境变量（两端都要配）
| 变量名 | 用途 | 示例 |
| --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Turnstile 站点公钥（构建期注入） | `0x4AAAAAAA...` |
| `FORM_ENDPOINT` | 独立 Worker 地址（不带路径） | `https://form.karfanjara.ge` |
| `MEDIA_BASE` | 本端静态资源域名；海外填 R2，国内填 COS | `https://assets.karfanjara.ge` / `https://assets.karfanjara.cn` |

> 构建时会分别注入到 `SITE.turnstileSiteKey` / `SITE.formEndpoint` / `SITE.mediaBase`。

---

## 4. 静态资源：海外 R2 + 国内 COS
- **海外**：本地 `public/uploads` → Cloudflare R2 桶（如 `karfanjara-assets`），绑定 `assets.karfanjara.ge`，`MEDIA_BASE=https://assets.karfanjara.ge`。
- **国内**：同一份 `public/uploads` → 腾讯云 COS 桶 + CDN，绑定 `assets.karfanjara.cn`，`MEDIA_BASE=https://assets.karfanjara.cn`。
- **双份同步**：在 GitHub Actions 或本地脚本中把 `public/uploads` 同时上传到 R2 与 COS；构建两端分别指定各自的 `MEDIA_BASE`。
- 本地开发留空 `MEDIA_BASE`，`asset()` 自动回退 `/uploads` 相对路径。

---

## 5. 内容管理：Decap CMS
后台位于 `/admin/`，基于 GitHub 后端，无需数据库。

1. **GitHub OAuth 应用**：GitHub → Settings → Developer settings → OAuth Apps，Homepage URL 填海外站点，Callback URL 填 Decap 网关（`https://api.netlify.com/auth/driver/clients/github`）。
2. **登录编辑**：访问海外站点 `https://www.karfanjara.ge/admin/`，GitHub 登录后编辑 Articles / Products / Projects。
3. **保存 → 提交 Git → 两端平台各自检测到提交 → 自动重新构建**，内容双端上线。

> 权限模型：仓库协作者 = 编辑者。**编辑统一走海外站点**（GitHub OAuth / Netlify 网关在大陆可能不稳）；国内站点可不开放 `/admin/`。

---

## 6. 域名与智能解析（分流）
- **两个不同域名**（如 `www.karfanjara.ge` 海外 + `www.karfanjara.cn` 国内）最简单：各自绑在对应平台，用户各走各的。
- **同一域名智能分流**（体验更佳）：用一个智能 DNS（DNSPod / 阿里云解析），按运营商线路把大陆用户解析到 EdgeOne CDN 域名、海外用户解析到 Cloudflare Pages 域名；任一平台故障可一键切换解析。
- 国内域名必须 ICP 备案；备案期间的域名建议先用 EdgeOne 的 `.pages.dev` 等价预览域名。

---

## 7. 安全
- Secret 只存于 Worker（`wrangler secret`）与站点环境变量，绝不进仓库/前端。
- Turnstile 私钥只在 Worker 服务端校验（`challenges.cloudflare.com` 若大陆不稳，可在 Worker 侧替换为腾讯云验证码）。
- EdgeOne 与 Cloudflare 均开启默认 WAF；表单接口可加限流防刷。
- Worker 仅开放 `POST /api/contact`、`/api/quote`，其余路径返回 404。

---

## 8. 本地与生产构建验证
```bash
npm install
npm run dev            # 站点 + CMS + 本地 R2
npm run build          # 静态构建（输出 dist/）
npm run preview        # 预览构建产物
npm run worker:dev     # 本地调试 Worker（http://127.0.0.1:8787）
npm run worker:deploy  # 部署 Worker
```
构建成功标志：终端出现 `✓ Completed`，`dist/` 生成各语言 HTML、`search-index.json`、`admin/`；表单 `action` 指向 Worker 地址。

---

## 9. 首次上线检查清单
- [ ] Worker 已部署，`curl` 验证 `/api/contact`、`/api/quote` 返回 `ok:true`。
- [ ] Cloudflare Pages 已连仓库，`npm run build` + `dist` + Node ≥ 20，绑定海外域名。
- [ ] EdgeOne Pages 已连同一仓库，加速区域中国大陆，绑定已备案国内域名。
- [ ] 两端构建环境变量（`TURNSTILE_SITE_KEY` / `FORM_ENDPOINT` / `MEDIA_BASE`）已配。
- [ ] R2（海外）+ COS（国内）资源域名已绑定，`MEDIA_BASE` 各指各的。
- [ ] `/admin/` 经 GitHub OAuth 可登录编辑，发布后双端内容同步上线。
- [ ] 联系 / 报价表单在两端经 Turnstile 校验可成功提交（Worker 日志可见）。
- [ ] `/`、`/zh/` 等各语言路由在两端均可访问。

---

## 10. 后续维护
- **更新内容**：登录 `/admin/` 编辑发布，两端自动重建，无需碰代码。
- **更新模板/文案**：改 `src/` 后推 Git，两端自动重建。
- **表单逻辑**：改 `worker/src/index.ts` 后 `npm run worker:deploy`，站点无需动。
- **备份**：代码在 Git；资源在 R2/COS（可开版本管理）；内容与代码同源。
