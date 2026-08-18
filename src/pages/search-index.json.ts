import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// 构建期生成 /search-index.json，供前端静态搜索使用（含双语）
export const GET: APIRoute = async () => {
  const [articles, products, projects] = await Promise.all([
    getCollection('articles'),
    getCollection('products'),
    getCollection('projects'),
  ]);

  const items: any[] = [];

  const pushArticle = (e: any, locale: 'zh' | 'en' | 'es', url: string) => {
    items.push({
      type: 'article',
      locale,
      title: e.data.title,
      excerpt: e.data.excerpt,
      category: e.data.category,
      url,
    });
  };
  for (const e of articles) {
    // glob loader 把 a1.en.md 的 id slug 化为 a1en
    const suffix = e.id.endsWith('en') ? 'en' : e.id.endsWith('es') ? 'es' : 'zh';
    const base = suffix === 'zh' ? e.id : e.id.slice(0, -2);
    pushArticle(e, suffix, suffix === 'en' ? `/articles/${base}/` : `/${suffix}/articles/${base}/`);
  }

  const loc = (data: any, field: string, locale: 'zh' | 'en' | 'es') =>
    locale === 'en' ? data[`${field}En`] || data[field] : locale === 'es' ? data[`${field}Es`] || data[`${field}En`] || data[field] : data[field];

  for (const e of products) {
    for (const locale of ['zh', 'en', 'es'] as const) {
      items.push({
        type: 'product',
        locale,
        title: loc(e.data, 'title', locale),
        excerpt: loc(e.data, 'excerpt', locale) || '',
        category: loc(e.data, 'category', locale),
        url: locale === 'en' ? `/products/${e.id}/` : `/${locale}/products/${e.id}/`,
      });
    }
  }

  for (const e of projects) {
    for (const locale of ['zh', 'en', 'es'] as const) {
      items.push({
        type: 'project',
        locale,
        title: loc(e.data, 'title', locale),
        excerpt: loc(e.data, 'excerpt', locale) || '',
        category: loc(e.data, 'client', locale),
        url: locale === 'en' ? `/projects/${e.id}/` : `/${locale}/projects/${e.id}/`,
      });
    }
  }

  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json' },
  });
};
