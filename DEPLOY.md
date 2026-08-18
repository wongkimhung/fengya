# 部署指南 (DEPLOY)

> 如果只需要“GitHub 托管代码 + Cloudflare Pages 托管页面”，请直接阅读 [CLOUDFLARE-PAGES.md](./CLOUDFLARE-PAGES.md)。其中包含 GitHub 自动部署、环境变量、Worker 和可选一键脚本。

> 目标：将本 Astro 静态门户**双活部署**到 **Cloudflare Pages（海外）** 与 **腾讯云 EdgeOne Pages（中国大陆）**，共用一套 GitHub 仓库与内容；表单逻辑由**独立 Cloudflare Worker** 统一承担（两个平台都能跑纯静态，但 Pages Function 只在 Cloudflare 生效，故抽离为通用接口）。全程零服务器运维。

架构：`GitHub 仓库 → Cloudflare Pages（海外 CDN）` + `GitHub 仓库 → 腾讯云 EdgeOne Pages（国内 CDN）`；资源走 R2（海外）与 COS（国内）双份；表单走独立 Worker（`worker/`）的 `/api/contact` 与 `/api/quote`。

```
Decap CMS ──▶ GitHub（唯一内容源）
                 │ 两端平台各自连接仓库自动构建
                 ├─▶ Cloudflare Pages ──▶ 海外访问（www 域名）
                 └─▶ 腾讯云 EdgeOne Pages ─▶ 国内访问（备案域名）
表单前端 ──▶ 独立 Cloudflare Worker（/api/contact · /api/quote · /api/translate）
Decap CMS ──▶ 独立 Cloudflare Worker（/auth · /callback）──▶ GitHub OAuth
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

> 功能、原理、本地调试的三语文档（中文 / English / Español）见文末**附录**，或 `worker/README.md`。

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
   npx wrangler secret put GITHUB_OAUTH_ID       # Decap GitHub OAuth Client ID
   npx wrangler secret put GITHUB_OAUTH_SECRET   # Decap GitHub OAuth Client Secret
   # 私有 GitHub 仓库才需要：
   npx wrangler secret put GITHUB_REPO_PRIVATE   # 输入 1
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
| `DECAP_AUTH_BASE_URL` | Decap GitHub OAuth Worker 地址（不填 Pages 地址） | `https://karfanjara-form.kdroid.workers.dev` |

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

1. **GitHub OAuth 应用**：GitHub → Settings → Developer settings → OAuth Apps，Homepage URL 填 `https://karfanjara-form.kdroid.workers.dev`，Callback URL 填 `https://karfanjara-form.kdroid.workers.dev/callback`；然后按 [Cloudflare Pages 教程的 CMS 登录步骤](./CLOUDFLARE-PAGES.md#41-配置-cms-的-github-登录cloudflare-pages-必需) 配置 `DECAP_AUTH_BASE_URL`、`GITHUB_OAUTH_ID`、`GITHUB_OAUTH_SECRET`。
2. **登录编辑**：访问海外站点 `https://www.karfanjara.ge/admin/`，GitHub 登录后编辑 Articles / Products / Projects。
3. **保存 → 提交 Git → 两端平台各自检测到提交 → 自动重新构建**，内容双端上线。

> 权限模型：仓库协作者 = 编辑者。**编辑统一走海外站点**（GitHub OAuth / Cloudflare Worker OAuth 代理在大陆可能不稳）；国内站点可不开放 `/admin/`。

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
- Worker 开放表单接口 `POST /api/contact`、`POST /api/quote`、`POST /api/translate`，以及 Decap 登录所需的 `GET /auth`、`GET /callback`；其余路径返回 404。

---

## 8. 本地与生产构建验证
```bash
npm install
npm run dev:full      # 站点 + CMS + 本地 R2 + Worker（表单自动指向本地 Worker，见附录）
npm run dev           # 仅站点 + CMS + 本地 R2
npm run build         # 静态构建（输出 dist/）
npm run preview       # 预览构建产物
npm run worker:dev    # 仅本地调试 Worker（http://127.0.0.1:8787）
npm run worker:deploy # 部署 Worker
```
构建成功标志：终端出现 `✓ Completed`，`dist/` 生成各语言 HTML、`search-index.json`、`admin/`；表单 `action` 指向 Worker 地址。

---

## 9. 首次上线检查清单
- [ ] Worker 已部署，`curl` 验证 `/api/contact`、`/api/quote` 返回 `ok:true`。
- [ ] Cloudflare Pages 已连仓库，`npm run build` + `dist` + Node ≥ 20，绑定海外域名。
- [ ] EdgeOne Pages 已连同一仓库，加速区域中国大陆，绑定已备案国内域名。
- [ ] 两端构建环境变量（`TURNSTILE_SITE_KEY` / `FORM_ENDPOINT` / `MEDIA_BASE`）已配。
- [ ] Cloudflare Pages Production 已配置 `DECAP_AUTH_BASE_URL=https://karfanjara-form.kdroid.workers.dev`，没有填 `fengya.pages.dev`。
- [ ] Worker Secrets 已配置 `GITHUB_OAUTH_ID`、`GITHUB_OAUTH_SECRET`；私有仓库另配 `GITHUB_REPO_PRIVATE=1`。
- [ ] GitHub OAuth App 的 callback URL 是 `https://karfanjara-form.kdroid.workers.dev/callback`。
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

---

# 附录：Worker 接口文档（中文 / English / Español）

本附录与 `worker/README.md` 保持一致，记录独立 Cloudflare Worker 的**功能、原理与本地调试**。

## 中文

### 一、实现什么功能

| 路由 | 功能 |
| --- | --- |
| `GET /auth?provider=github` | Decap CMS GitHub OAuth 登录入口 |
| `GET /callback` | GitHub OAuth 回调，仅把短期授权结果回传给 CMS 弹窗，不保存 Token |
| `POST /api/contact` | 联系表单：姓名 / 电话 / 邮箱 / 留言；Turnstile 人机校验；成功后转发到 Webhook（`NOTIFY_URL`，可接 Slack / 飞书 / 自有接口） |
| `POST /api/quote`  | 报价表单：姓名 / 电话 / 产品类型 / 面积 / 地址 / 描述；Turnstile 校验；记录写入 Cloudflare KV（90 天过期）；经 Resend 发邮件通知管理员 |
| `POST /api/translate` | 翻译助手代理（zh / en / es）：Google Cloud Translation API 的 Key 只在 Worker 服务端，浏览器不暴露 |
| 其他路径 / 方法 | 一律返回 404 / 405 |

通用能力：
- **CORS 预检**：允许任意来源跨域提交（`Access-Control-Allow-Origin: *`）。
- **人机校验**：Turnstile 私钥只在 Worker 服务端保存，前端只拿站点公钥，防止机器人刷单。
- **容错**：Webhook / 邮件 / KV 任一步失败都不影响前端收到「提交成功」，避免用户重复提交。

所需配置（`wrangler secret`，不进仓库）：
`TURNSTILE_SECRET_KEY`、`NOTIFY_URL`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`QUOTE_NOTIFY_TO`、`GOOGLE_TRANSLATE_API_KEY`、`GITHUB_OAUTH_ID`、`GITHUB_OAUTH_SECRET`，以及 KV 绑定 `QUOTES`。`TRANSLATE_ALLOWED_ORIGIN`、`DECAP_CMS_ORIGIN`、`GITHUB_REPO_PRIVATE` 可按 `worker/wrangler.toml` 配置。

### 二、实现原理

1. **为什么抽成独立 Worker**：Pages Function 只有 Cloudflare Pages 能执行，腾讯云 EdgeOne Pages 无法运行 `functions/` 目录。把表单逻辑抽成一个独立 Worker 后，**任何静态平台只需 POST 到同一个绝对地址**，两端行为完全一致，只需维护一份代码。
2. **前端如何调用**：表单的 `action` 由服务端构建时从 `SITE.formEndpoint`（环境变量 `FORM_ENDPOINT`）渲染成 Worker 地址；`main.js` 读取 `form.action` 做跨域 `fetch`，不再写死 `/api/*` 路径。
3. **数据流**：
   ```
   用户提交 → Worker 校验必填字段 → 校验 Turnstile（服务端，私钥不暴露）
          → 写 KV / 发邮件 / 转发 Webhook → 返回 { ok: true }
   ```
4. **与站点的关系**：站点是纯静态产物，不含任何后端；Worker 是独立部署的服务，二者通过环境变量 `FORM_ENDPOINT` 解耦。构建时两端还需配置 `TURNSTILE_SITE_KEY`、`MEDIA_BASE` 等。
5. **除表单外的职责**：`/api/translate` 充当翻译助手代理（密钥只存服务端）；`/auth`、`/callback` 自托管 Decap CMS 的 GitHub OAuth，避免依赖在部分网络环境不稳定的官方网关。

### 三、如何本地调试

一键启动全部依赖（站点 + CMS + 本地 R2 + Worker，表单自动指向本地 Worker）：

```bash
npm run dev:full
```

- 站点：http://localhost:4321 （表单 `action` 指向 `http://127.0.0.1:8787/api/...`）
- Worker：http://127.0.0.1:8787 （`wrangler dev` 本地模拟 KV，无需真实云资源）
- CMS：http://localhost:4321/admin/
- 本地 R2：http://localhost:8788

单独调试 Worker：

```bash
npm run worker:dev          # 启动 http://127.0.0.1:8787
```

命令行自测（未配置 `TURNSTILE_SECRET_KEY` 时自动跳过人机校验）：

```bash
curl -X POST http://127.0.0.1:8787/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"张三","phone":"123","message":"你好"}'
# → {"ok":true}

curl -X POST http://127.0.0.1:8787/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"name":"李四","phone":"456","description":"铝合金窗 25㎡"}'
# → {"ok":true,"id":"1786...","message":"Quote request received. ..."}

curl -X POST http://127.0.0.1:8787/api/quote -d '{}'
# → {"ok":false,"error":"missing required fields: ..."}

curl -X POST http://127.0.0.1:8787/api/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"你好","target":"es","source":"zh"}'
# 需配置 GOOGLE_TRANSLATE_API_KEY → {"ok":true,"translatedText":"Hola",...}
```

> 只改 Worker 逻辑：改 `worker/src/index.ts` 后 `npm run worker:dev` 即可热重载，站点无需重启。
> `/auth` 与 `/callback` 需要 `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET`；callback 还需 `DECAP_CMS_ORIGIN`。

---

## Appendix: Worker API documentation (English)

### 1. What it does

| Route | Function |
| --- | --- |
| `GET /auth?provider=github` | Decap CMS GitHub OAuth entry point |
| `GET /callback` | GitHub OAuth callback; returns the short-lived result to the CMS popup only — never stores tokens |
| `POST /api/contact` | Contact form: name / phone / email / message; Turnstile bot check; forwards to a webhook (`NOTIFY_URL`, e.g. Slack / Feishu / your own endpoint) on success |
| `POST /api/quote`  | Quote form: name / phone / product type / area / location / description; Turnstile check; stores the record in Cloudflare KV (90-day expiry); sends an email via Resend to the admin |
| `POST /api/translate` | Translation proxy (zh / en / es): the Google Cloud Translation API key lives only in the Worker, never in the browser |
| Anything else      | Returns 404 / 405 |

Common capabilities:
- **CORS preflight**: accepts cross-origin submissions from any origin (`Access-Control-Allow-Origin: *`).
- **Bot protection**: the Turnstile secret lives only server-side in the Worker; the frontend only has the public site key.
- **Fault tolerance**: a webhook / email / KV failure never fails the response to the user (avoids duplicate submissions).

Required config (`wrangler secret`, never committed): `TURNSTILE_SECRET_KEY`, `NOTIFY_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_NOTIFY_TO`, `GOOGLE_TRANSLATE_API_KEY`, `GITHUB_OAUTH_ID`, `GITHUB_OAUTH_SECRET`, plus the KV binding `QUOTES`. `TRANSLATE_ALLOWED_ORIGIN`, `DECAP_CMS_ORIGIN` and `GITHUB_REPO_PRIVATE` can be set in `worker/wrangler.toml`.

### 2. How it works

1. **Why a standalone Worker**: Pages Functions only run on Cloudflare Pages — Tencent EdgeOne Pages cannot execute a `functions/` directory. Extracting the form logic into an independent Worker means **any static platform just POSTs to the same absolute URL**, so both deployments behave identically from one codebase.
2. **Frontend calling convention**: the form `action` is rendered at build time from `SITE.formEndpoint` (env var `FORM_ENDPOINT`) into the Worker URL; `main.js` reads `form.action` and does a cross-origin `fetch` — no hardcoded `/api/*` paths.
3. **Data flow**:
   ```
   User submits → Worker validates required fields → verifies Turnstile (server-side, secret hidden)
              → writes KV / sends email / forwards webhook → returns { ok: true }
   ```
4. **Relationship with the site**: the site is a pure static build with no backend; the Worker is a separately deployed service, decoupled via the `FORM_ENDPOINT` env var. Both platforms also need `TURNSTILE_SITE_KEY`, `MEDIA_BASE`, etc. at build time.
5. **Beyond forms**: `/api/translate` proxies the translation assistant (key kept server-side); `/auth` and `/callback` self-host Decap CMS's GitHub OAuth, avoiding the default gateway that can be unreliable in some networks.

### 3. Local debugging

Start everything with one command (site + CMS + local R2 + Worker; forms point to the local Worker automatically):

```bash
npm run dev:full
```

- Site: http://localhost:4321 (form `action` points to `http://127.0.0.1:8787/api/...`)
- Worker: http://127.0.0.1:8787 (`wrangler dev` simulates KV locally, no cloud resources needed)
- CMS: http://localhost:4321/admin/
- Local R2: http://localhost:8788

Worker only:

```bash
npm run worker:dev          # serves http://127.0.0.1:8787
```

Quick CLI checks (bot check is skipped when `TURNSTILE_SECRET_KEY` is unset):

```bash
curl -X POST http://127.0.0.1:8787/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","phone":"123","message":"Hello"}'
# → {"ok":true}

curl -X POST http://127.0.0.1:8787/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bob","phone":"456","description":"Aluminum windows 25㎡"}'
# → {"ok":true,"id":"1786...","message":"Quote request received. ..."}

curl -X POST http://127.0.0.1:8787/api/quote -d '{}'
# → {"ok":false,"error":"missing required fields: ..."}

curl -X POST http://127.0.0.1:8787/api/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"你好","target":"es","source":"zh"}'
# needs GOOGLE_TRANSLATE_API_KEY → {"ok":true,"translatedText":"Hola",...}
```

> Worker-only changes: edit `worker/src/index.ts` and `npm run worker:dev` hot-reloads; the site needs no restart.
> `/auth` and `/callback` require `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET`; the callback also needs `DECAP_CMS_ORIGIN`.

---

## Apéndice: Documentación de la API del Worker (Español)

### 1. Qué hace

| Ruta | Función |
| --- | --- |
| `GET /auth?provider=github` | Punto de entrada OAuth de GitHub para Decap CMS |
| `GET /callback` | Callback OAuth de GitHub; devuelve el resultado de corta vida solo al popup del CMS — nunca guarda tokens |
| `POST /api/contact` | Formulario de contacto: nombre / teléfono / email / mensaje; verificación anti-bots Turnstile; reenvío a un webhook (`NOTIFY_URL`, p. ej. Slack / Feishu / tu propio endpoint) al tener éxito |
| `POST /api/quote`  | Formulario de cotización: nombre / teléfono / tipo de producto / área / ubicación / descripción; verificación Turnstile; guarda el registro en Cloudflare KV (caducidad de 90 días); envía un email vía Resend al administrador |
| `POST /api/translate` | Proxy de traducción (zh / en / es): la clave de Google Cloud Translation vive solo en el Worker, nunca en el navegador |
| Cualquier otra ruta | Devuelve 404 / 405 |

Capacidades comunes:
- **CORS preflight**: acepta envíos de origen cruzado desde cualquier dominio (`Access-Control-Allow-Origin: *`).
- **Protección anti-bots**: el secreto de Turnstile vive solo en el servidor (Worker); el frontend solo tiene la clave pública del sitio.
- **Tolerancia a fallos**: un fallo en webhook / email / KV nunca hace fallar la respuesta al usuario (evita envíos duplicados).

Configuración necesaria (`wrangler secret`, nunca en el repo): `TURNSTILE_SECRET_KEY`, `NOTIFY_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_NOTIFY_TO`, `GOOGLE_TRANSLATE_API_KEY`, `GITHUB_OAUTH_ID`, `GITHUB_OAUTH_SECRET`, y el binding KV `QUOTES`. `TRANSLATE_ALLOWED_ORIGIN`, `DECAP_CMS_ORIGIN` y `GITHUB_REPO_PRIVATE` se pueden definir en `worker/wrangler.toml`.

### 2. Cómo funciona

1. **Por qué un Worker independiente**: las Pages Functions solo se ejecutan en Cloudflare Pages — Tencent EdgeOne Pages no puede ejecutar un directorio `functions/`. Al extraer la lógica de formularios a un Worker independiente, **cualquier plataforma estática solo tiene que hacer POST a la misma URL absoluta**, por lo que ambos despliegues se comportan igual desde un único código.
2. **Cómo lo llama el frontend**: el atributo `action` del formulario se genera en tiempo de build desde `SITE.formEndpoint` (variable `FORM_ENDPOINT`) apuntando a la URL del Worker; `main.js` lee `form.action` y hace un `fetch` de origen cruzado — sin rutas `/api/*` hardcodeadas.
3. **Flujo de datos**:
   ```
   El usuario envía → el Worker valida campos obligatorios → verifica Turnstile (servidor, secreto oculto)
                  → escribe en KV / envía email / reenvía webhook → devuelve { ok: true }
   ```
4. **Relación con el sitio**: el sitio es un build 100 % estático sin backend; el Worker es un servicio desplegado por separado, desacoplados mediante la variable `FORM_ENDPOINT`. Ambas plataformas también necesitan `TURNSTILE_SITE_KEY`, `MEDIA_BASE`, etc. en el build.
5. **Más allá de los formularios**: `/api/translate` hace de proxy del asistente de traducción (la clave vive en el servidor); `/auth` y `/callback` alojan el OAuth de GitHub para Decap CMS, evitando la puerta de enlace oficial que puede ser inestable en algunas redes.

### 3. Depuración local

Inicia todo con un solo comando (sitio + CMS + R2 local + Worker; los formularios apuntan automáticamente al Worker local):

```bash
npm run dev:full
```

- Sitio: http://localhost:4321 (el `action` del formulario apunta a `http://127.0.0.1:8787/api/...`)
- Worker: http://127.0.0.1:8787 (`wrangler dev` simula KV en local, sin recursos en la nube)
- CMS: http://localhost:4321/admin/
- R2 local: http://localhost:8788

Solo el Worker:

```bash
npm run worker:dev          # sirve http://127.0.0.1:8787
```

Pruebas rápidas por CLI (la verificación anti-bots se omite si `TURNSTILE_SECRET_KEY` no está definida):

```bash
curl -X POST http://127.0.0.1:8787/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana","phone":"123","message":"Hola"}'
# → {"ok":true}

curl -X POST http://127.0.0.1:8787/api/quote \
  -H 'Content-Type: application/json' \
  -d '{"name":"Luis","phone":"456","description":"Ventanas de aluminio 25㎡"}'
# → {"ok":true,"id":"1786...","message":"Quote request received. ..."}

curl -X POST http://127.0.0.1:8787/api/quote -d '{}'
# → {"ok":false,"error":"missing required fields: ..."}
```

> Cambios solo en el Worker: edita `worker/src/index.ts` y `npm run worker:dev` recarga en caliente; el sitio no necesita reiniciarse.
> `/auth` y `/callback` requieren `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET`; el callback también necesita `DECAP_CMS_ORIGIN`.
