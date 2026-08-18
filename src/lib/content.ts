import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/ui';

type ArticleEntry = CollectionEntry<'articles'>;
type ProductEntry = CollectionEntry<'products'>;
type ProjectEntry = CollectionEntry<'projects'>;

/** 按语言选取文章条目（默认中文文件，英文/西文以 <slug>.en/.es 平行存放）。
 * Astro glob loader 会把 a1.en.md 的 id slug 化为 a1en。 */
export async function getArticles(locale: Locale): Promise<ArticleEntry[]> {
  const all = await getCollection('articles');
  const byBase = new Map<string, ArticleEntry>();
  for (const e of all) {
    const suffix = e.id.endsWith('en') ? 'en' : e.id.endsWith('es') ? 'es' : '';
    const base = suffix ? e.id.slice(0, -2) : e.id;
    const cur = byBase.get(base);
    if (!cur) {
      byBase.set(base, e);
    } else if (locale === suffix) {
      byBase.set(base, e);
    } else if (locale === 'zh' && !suffix) {
      byBase.set(base, e);
    }
  }
  return [...byBase.values()].sort(
    (a, b) => +new Date(b.data.date) - +new Date(a.data.date)
  );
}

export async function getArticle(slug: string, locale: Locale) {
  const all = await getCollection('articles');
  const direct = all.find((e) => e.id === (locale === 'en' ? `${slug}en` : locale === 'es' ? `${slug}es` : slug));
  if (direct) return direct;
  // 回退：该语言版本不存在时使用另一语言
  return all.find((e) => e.id === slug) ?? null;
}

export async function getProducts(locale: Locale): Promise<ProductEntry[]> {
  const all = await getCollection('products');
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getProduct(slug: string) {
  const all = await getCollection('products');
  return all.find((e) => e.id === slug) ?? null;
}

export async function getProjects(locale: Locale): Promise<ProjectEntry[]> {
  const all = await getCollection('projects');
  return all.sort((a, b) => +new Date(b.data.completionDate) - +new Date(a.data.completionDate));
}

export async function getProject(slug: string) {
  const all = await getCollection('projects');
  return all.find((e) => e.id === slug) ?? null;
}

/** 产品/项目的双语字段回退 */
export function loc<T extends { [k: string]: any }>(
  data: T,
  field: string,
  locale: Locale
): string {
  const suffix = locale === 'en' ? 'En' : locale === 'es' ? 'Es' : '';
  if (suffix && data[`${field}${suffix}`]) return data[`${field}${suffix}`];
  return data[field] ?? '';
}

/** 相关文章：同分类优先，其次按标签重合度 */
export function relatedArticles(
  current: ArticleEntry,
  pool: ArticleEntry[],
  limit = 3
): ArticleEntry[] {
  return pool
    .filter((a) => a.id !== current.id)
    .map((a) => {
      const sameCat = a.data.category === current.data.category ? 2 : 0;
      const sharedTags = a.data.tags.filter((t) =>
        current.data.tags.includes(t)
      ).length;
      return { a, score: sameCat + sharedTags };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
