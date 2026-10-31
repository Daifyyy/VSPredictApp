import type { MetadataRoute } from 'next';
const BASE = process.env.AUTH_URL ?? 'https://vs-predict-app.vercel.app';
export default function sitemap(): MetadataRoute.Sitemap {
 return ['/', '/vysledky', '/vykonnost', '/denni-vyber'].map(path => ({
   url: BASE + path, lastModified: new Date(), changeFrequency: 'daily' as const, priority: path === '/' ? 1 : 0.8,
 }));
}
