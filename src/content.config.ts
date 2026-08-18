import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 内容集合：与 Decap CMS 的 collections 一一对应
// 文章使用 Markdown 文件（当前停用但保留数据）；英文版本以 `<slug>.en.md` 平行存放。

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    coverImage: z.string(),
    excerpt: z.string(),
    tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string().optional(),
    titleEs: z.string().optional(),
    detailTitle: z.string().optional(),
    detailTitleEn: z.string().optional(),
    detailTitleEs: z.string().optional(),
    category: z.enum(['核心产品', '解决方案', '配套服务']),
    categoryEn: z.string().optional(),
    categoryEs: z.string().optional(),
    mainImage: z.string(),
    gallery: z.array(z.string()).default([]),
    advantagesTitle: z.string().optional(),
    advantagesTitleEn: z.string().optional(),
    advantagesTitleEs: z.string().optional(),
    advantages: z.array(z.string()).default([]),
    advantagesEn: z.array(z.string()).default([]),
    advantagesEs: z.array(z.string()).default([]),
    specs: z
      .array(z.object({ key: z.string(), keyEn: z.string().optional(), keyEs: z.string().optional(), value: z.string(), valueEn: z.string().optional(), valueEs: z.string().optional() }))
      .default([]),
    brochure: z.string().optional(),
    excerpt: z.string().optional(),
    excerptEn: z.string().optional(),
    excerptEs: z.string().optional(),
    bodyEn: z.string().optional(),
    bodyEs: z.string().optional(),
    order: z.number().default(99),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string().optional(),
    titleEs: z.string().optional(),
    client: z.string(),
    clientEn: z.string().optional(),
    clientEs: z.string().optional(),
    completionDate: z.coerce.date(),
    metrics: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          labelEn: z.string().optional(),
          labelEs: z.string().optional(),
        })
      )
      .default([]),
    cover: z.string(),
    gallery: z.array(z.string()).default([]),
    caseStudyPdf: z.string().optional(),
    excerpt: z.string().optional(),
    excerptEn: z.string().optional(),
    excerptEs: z.string().optional(),
    order: z.number().default(99),
  }),
});

export const collections = { articles, products, projects };
