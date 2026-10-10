import { z } from 'astro/zod';
import { galleryContent, pageSettings, workbenchContent } from '@saas-maker/templates/schema';

const link = z.object({ label: z.string(), href: z.string() }).strict();
const text = z.string().min(1);

// Reuse the library's page/footer contracts, with a tool-specific body.
export const homeContent = z.object({
  page: pageSettings,
  product: text,
  url: z.string().url(),
  nav: z.array(link),
  intro: z.object({ eyebrow: text, title: text, body: text }).strict(),
  composer: z.object({
    label: text, placeholder: text, retention: text, examplesTitle: text, submit: text,
    examples: z.array(z.object({ value: text, label: text }).strict()).length(6),
  }).strict(),
  collection: z.object({
    title: text, browse: text, note: text,
    items: z.array(z.object({ href: text, image: z.string().url(), alt: text, title: text, body: text }).strict()).length(3),
  }).strict(),
  result: z.object({
    alternativesTitle: text, alternativesSubtitle: text, feedbackTitle: text,
    retention: text, landed: text, missed: text, again: text,
  }).strict(),
  noMatch: z.object({ eyebrow: text, title: text, edit: text }).strict(),
  about: z.array(z.object({ title: text, body: text }).strict()).length(3),
  footer: workbenchContent.shape.footer.options[0].extend({
    art: galleryContent.shape.footer.options[0].shape.art,
    catalogId: z.literal('meme-lab'),
    capture: z.literal('newsletter'),
  }).strict(),
}).strict();
