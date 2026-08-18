# CMS 内容管理

## 后台入口

- 生产环境：`/admin/`，使用 GitHub backend，发布后直接提交到 `main`。
- 本地开发：运行 `npm run dev:all`（或同时运行 `npm run dev` 和 `npm run cms`），直接访问 `/admin/` 即可免登录；本地入口会自动切换到 `config.local.yml`，通过 `http://localhost:8081/api/v1` 读写当前 Git 工作区。
- 翻译助手：CMS 右下角的「打开 Google 翻译助手」，或直接访问 `/admin/translator/`。

所有文章、翻译、产品、项目、图片引用和站点配置都以 Git 仓库文件为唯一内容源，不使用外部 CMS 数据库或内容存储。

## 可管理内容

- `News`：在 CMS 发布新闻，文章使用 `src/content/articles/`，支持中文、英文、西班牙语并排编辑。
- `Site Settings / Contact Information`：电话、WhatsApp、邮箱、营业时间、地址、WhatsApp 默认文案和社交链接。
- `Site Settings / Brand, SEO & Homepage Copy`：品牌名、Logo、各语言 SEO、Hero/联系 CTA/Footer 文案。
- `Products`：四个独立产品页的标题、分类、优势、规格、图集、摘要和正文。
- `Projects`：项目名称、客户、指标、摘要、图集和案例正文。

站点配置写入 `public/data/contact.json` 和 `public/data/site.json`。联系方式会在构建时渲染默认值，并由前端再次读取 JSON，因此修改后重新构建即可全站生效。

## Google 翻译配置

翻译助手调用独立 Worker 的 `/api/translate`，Google API key 只放在 Worker Secret。Worker 只返回实时翻译结果，不保存文章、译文或翻译历史；把结果填回 CMS 并点击发布后，译文会写入对应的 Markdown/JSON 文件并提交到 Git：

```bash
npx wrangler secret put GOOGLE_TRANSLATE_API_KEY --config worker/wrangler.toml
```

可选地在 `worker/wrangler.toml` 配置 `TRANSLATE_ALLOWED_ORIGIN`，限制只能从正式站点调用。未配置 key 时，后台助手会提示 translation is not configured。

## 语言路由

- English：`/`
- 中文：`/zh/`
- Español：`/es/`

产品、新闻和项目详情页会用对应语言字段；缺少西班牙语字段时暂时回退英文，方便先发布内容再逐步补齐翻译。
