# 独立 Cloudflare Worker — 表单接口 / Form Endpoint / Punto de conexión de formularios

本目录是一个**独立部署的 Cloudflare Worker**，取代了原先随站点的 Cloudflare Pages Function，为多平台静态站点（Cloudflare Pages、腾讯云 EdgeOne Pages 等）提供**统一的表单接口**。

This directory is a **standalone Cloudflare Worker** that replaces the previous site-bundled Cloudflare Pages Function. It provides a **single shared form endpoint** for the static sites deployed on multiple platforms (Cloudflare Pages, Tencent EdgeOne Pages, etc.).

Este directorio es un **Cloudflare Worker independiente** que sustituye a la antigua Pages Function integrada en el sitio. Proporciona un **único endpoint de formularios compartido** para los sitios estáticos desplegados en varias plataformas (Cloudflare Pages, Tencent EdgeOne Pages, etc.).

---

## 中文

### 一、实现什么功能

| 路由 | 功能 |
| --- | --- |
| `POST /api/contact` | 联系表单：姓名 / 电话 / 邮箱 / 留言；Turnstile 人机校验；成功后转发到 Webhook（`NOTIFY_URL`，可接 Slack / 飞书 / 自有接口） |
| `POST /api/quote`  | 报价表单：姓名 / 电话 / 产品类型 / 面积 / 地址 / 描述；Turnstile 校验；记录写入 Cloudflare KV（90 天过期）；经 Resend 发邮件通知管理员 |
| 其他路径 / 方法 | 一律返回 404 / 405 |

通用能力：
- **CORS 预检**：允许任意来源跨域提交（`Access-Control-Allow-Origin: *`）。
- **人机校验**：Turnstile 私钥只在 Worker 服务端保存，前端只拿站点公钥，防止机器人刷单。
- **容错**：Webhook / 邮件 / KV 任一步失败都不影响前端收到「提交成功」，避免用户重复提交。

所需配置（`wrangler secret`，不进仓库）：
`TURNSTILE_SECRET_KEY`、`NOTIFY_URL`、`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`QUOTE_NOTIFY_TO`，以及 KV 绑定 `QUOTES`。

### 二、实现原理

1. **为什么抽成独立 Worker**：Pages Function 只有 Cloudflare Pages 能执行，腾讯云 EdgeOne Pages 无法运行 `functions/` 目录。把表单逻辑抽成一个独立 Worker 后，**任何静态平台只需 POST 到同一个绝对地址**，两端行为完全一致，只需维护一份代码。
2. **前端如何调用**：表单的 `action` 由服务端构建时从 `SITE.formEndpoint`（环境变量 `FORM_ENDPOINT`）渲染成 Worker 地址；`main.js` 读取 `form.action` 做跨域 `fetch`，不再写死 `/api/*` 路径。
3. **数据流**：
   ```
   用户提交 → Worker 校验必填字段 → 校验 Turnstile（服务端，私钥不暴露）
          → 写 KV / 发邮件 / 转发 Webhook → 返回 { ok: true }
   ```
4. **与站点的关系**：站点是纯静态产物，不含任何后端；Worker 是独立部署的服务，二者通过环境变量 `FORM_ENDPOINT` 解耦。构建时两端还需配置 `TURNSTILE_SITE_KEY`、`MEDIA_BASE` 等。

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
```

> 只改 Worker 逻辑：改 `worker/src/index.ts` 后 `npm run worker:dev` 即可热重载，站点无需重启。

---

## English

### 1. What it does

| Route | Function |
| --- | --- |
| `POST /api/contact` | Contact form: name / phone / email / message; Turnstile bot check; forwards to a webhook (`NOTIFY_URL`, e.g. Slack / Feishu / your own endpoint) on success |
| `POST /api/quote`  | Quote form: name / phone / product type / area / location / description; Turnstile check; stores the record in Cloudflare KV (90-day expiry); sends an email via Resend to the admin |
| Anything else      | Returns 404 / 405 |

Common capabilities:
- **CORS preflight**: accepts cross-origin submissions from any origin (`Access-Control-Allow-Origin: *`).
- **Bot protection**: the Turnstile secret lives only server-side in the Worker; the frontend only has the public site key.
- **Fault tolerance**: a webhook / email / KV failure never fails the response to the user (avoids duplicate submissions).

Required config (`wrangler secret`, never committed): `TURNSTILE_SECRET_KEY`, `NOTIFY_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_NOTIFY_TO`, plus the KV binding `QUOTES`.

### 2. How it works

1. **Why a standalone Worker**: Pages Functions only run on Cloudflare Pages — Tencent EdgeOne Pages cannot execute a `functions/` directory. Extracting the form logic into an independent Worker means **any static platform just POSTs to the same absolute URL**, so both deployments behave identically from one codebase.
2. **Frontend calling convention**: the form `action` is rendered at build time from `SITE.formEndpoint` (env var `FORM_ENDPOINT`) into the Worker URL; `main.js` reads `form.action` and does a cross-origin `fetch` — no hardcoded `/api/*` paths.
3. **Data flow**:
   ```
   User submits → Worker validates required fields → verifies Turnstile (server-side, secret hidden)
              → writes KV / sends email / forwards webhook → returns { ok: true }
   ```
4. **Relationship with the site**: the site is a pure static build with no backend; the Worker is a separately deployed service, decoupled via the `FORM_ENDPOINT` env var. Both platforms also need `TURNSTILE_SITE_KEY`, `MEDIA_BASE`, etc. at build time.

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
```

> Worker-only changes: edit `worker/src/index.ts` and `npm run worker:dev` hot-reloads; the site needs no restart.

---

## Español

### 1. Qué hace

| Ruta | Función |
| --- | --- |
| `POST /api/contact` | Formulario de contacto: nombre / teléfono / email / mensaje; verificación anti-bots Turnstile; reenvío a un webhook (`NOTIFY_URL`, p. ej. Slack / Feishu / tu propio endpoint) al tener éxito |
| `POST /api/quote`  | Formulario de cotización: nombre / teléfono / tipo de producto / área / ubicación / descripción; verificación Turnstile; guarda el registro en Cloudflare KV (caducidad de 90 días); envía un email vía Resend al administrador |
| Cualquier otra ruta | Devuelve 404 / 405 |

Capacidades comunes:
- **CORS preflight**: acepta envíos de origen cruzado desde cualquier dominio (`Access-Control-Allow-Origin: *`).
- **Protección anti-bots**: el secreto de Turnstile vive solo en el servidor (Worker); el frontend solo tiene la clave pública del sitio.
- **Tolerancia a fallos**: un fallo en webhook / email / KV nunca hace fallar la respuesta al usuario (evita envíos duplicados).

Configuración necesaria (`wrangler secret`, nunca en el repo): `TURNSTILE_SECRET_KEY`, `NOTIFY_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `QUOTE_NOTIFY_TO`, y el binding KV `QUOTES`.

### 2. Cómo funciona

1. **Por qué un Worker independiente**: las Pages Functions solo se ejecutan en Cloudflare Pages — Tencent EdgeOne Pages no puede ejecutar un directorio `functions/`. Al extraer la lógica de formularios a un Worker independiente, **cualquier plataforma estática solo tiene que hacer POST a la misma URL absoluta**, por lo que ambos despliegues se comportan igual desde un único código.
2. **Cómo lo llama el frontend**: el atributo `action` del formulario se genera en tiempo de build desde `SITE.formEndpoint` (variable `FORM_ENDPOINT`) apuntando a la URL del Worker; `main.js` lee `form.action` y hace un `fetch` de origen cruzado — sin rutas `/api/*` hardcodeadas.
3. **Flujo de datos**:
   ```
   El usuario envía → el Worker valida campos obligatorios → verifica Turnstile (servidor, secreto oculto)
                  → escribe en KV / envía email / reenvía webhook → devuelve { ok: true }
   ```
4. **Relación con el sitio**: el sitio es un build 100 % estático sin backend; el Worker es un servicio desplegado por separado, desacoplados mediante la variable `FORM_ENDPOINT`. Ambas plataformas también necesitan `TURNSTILE_SITE_KEY`, `MEDIA_BASE`, etc. en el build.

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
