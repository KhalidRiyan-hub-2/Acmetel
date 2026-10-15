// Blog posts for the homepage "Latest insights" section (components/home/BlogSection.astro).
// Copy source: content/source/blog.md (acmetel.com WordPress REST API, extracted 2026-10-15). Titles, dates, URLs and
// images are verbatim; summaries are the WordPress excerpts tightened to one or two sentences.
//
// Featured posts: set `featured: true`. The first featured post gets the large card; any other featured posts lead the
// grid with a "Featured" badge. With none flagged, the newest post is shown large (without the badge).
//
// WordPress: set WP_API_URL (e.g. https://acmetel.com) at build time and getPosts() reads the posts from the
// WordPress REST API instead of the list below. There, "featured" is WordPress's own "Stick to the top of the blog"
// checkbox (sticky posts), so editors pick featured posts in the CMS. If the request fails, the list below is used.

export interface BlogPost {
  title: string;
  /** One or two sentences for the card. */
  summary: string;
  /** Full article URL. */
  url: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  image: { src: string; width: number; height: number; alt: string };
  /** Short topic label shown above the title. */
  topic?: string;
  featured?: boolean;
}

/** The full blog index on the live site. */
export const blogIndexUrl = 'https://acmetel.com/blog/';

// PLACEHOLDER: images are hotlinked from acmetel.com (the client's live WordPress uploads); copy them into the
// project or serve them from the CMS before launch. Topic labels are ours: every post is "Uncategorized" in WordPress.
export const localPosts: BlogPost[] = [
  {
    title: 'How to Avoid Roaming Charges Abroad: The Smart Traveler’s Guide to Staying Connected in 2026',
    summary: 'You’ve just landed in a new country, switched off airplane mode and started using your phone as usual. The smart traveler’s guide to staying connected in 2026 without roaming charges.',
    url: 'https://acmetel.com/how-to-avoid-roaming-charges-abroad-the-smart-travelers-guide-to-staying-connected-in-2026/',
    date: '2026-06-11',
    image: { src: 'https://acmetel.com/wp-content/uploads/2026/06/Blog-Image-3-3.jpg', width: 1280, height: 720, alt: 'How to Avoid Roaming Charges Abroad' },
    topic: 'Travel & eSIM',
    featured: true,
  },
  {
    title: 'Travel eSIM for Digital Nomads: The Ultimate Guide',
    summary: 'Remote work has become a lifestyle, and for digital nomads good internet isn’t a convenience, it’s everything. Connectivity needs to just work, across countries and devices.',
    url: 'https://acmetel.com/travel-esim-for-digital-nomads-the-ultimate-guide/',
    date: '2026-05-08',
    image: { src: 'https://acmetel.com/wp-content/uploads/2026/05/Travel-eSIM-for-Digital-Nomads-The-Ultimate-Guide.jpg', width: 624, height: 351, alt: 'Travel eSIM for Digital Nomads' },
    topic: 'Travel & eSIM',
  },
  {
    title: 'eSIM: The Next Step in Mobile Evolution, Its Benefits, and the Future Ahead',
    summary: 'eSIMs are built directly into devices during manufacturing, bringing convenience, flexibility and a better user experience than traditional physical SIM cards.',
    url: 'https://acmetel.com/esim-the-next-step-in-mobile-evolution-its-benefits-and-the-future-ahead/',
    date: '2024-12-09',
    image: { src: 'https://acmetel.com/wp-content/uploads/2024/12/eSIM-The-Next-Step-in-Mobile-Evolution-Its-Benefits-and-the-Future-Ahead.jpg', width: 1280, height: 720, alt: 'eSIM: The Next Step in Mobile Evolution' },
    topic: 'eSIM',
  },
  {
    title: 'Comprehensive Guide to AI Scams with Common Tactics and Preventive Strategies',
    summary: 'The same generative AI that writes, codes and produces realistic images, audio and video is appealing to cybercriminals. Businesses must strengthen their defences as AI-driven scams advance.',
    url: 'https://acmetel.com/comprehensive-guide-to-ai-scams-with-common-tactics-and-preventive-strategies/',
    date: '2024-11-07',
    image: { src: 'https://acmetel.com/wp-content/uploads/2024/11/Common-Tactics-and-Preventive-Strategies.jpg', width: 1280, height: 720, alt: 'AI scams: common tactics and preventive strategies' },
    topic: 'Security',
  },
  {
    title: 'Voice Firewalls and Its Role in Advancing VoIP Security and Performance',
    summary: 'A voice firewall protects VoIP networks by monitoring and filtering traffic, blocking harmful calls or messages before they can breach the system.',
    url: 'https://acmetel.com/voice-firewalls-and-its-role-in-advancing-voip-security-and-performance/',
    date: '2024-10-03',
    image: { src: 'https://acmetel.com/wp-content/uploads/2024/10/Voice-Firewalls-and-Its-Role-in-Advancing-VoIP-Security.jpg', width: 1280, height: 720, alt: 'Voice firewalls and VoIP security' },
    topic: 'Voice',
  },
  {
    title: 'Understanding RCS Messaging and 5 Ways It’s Improving the Telecom Experience',
    summary: 'RCS, or Rich Communication Services, is an advanced messaging protocol that replaces traditional SMS for Android users, adding video, images and interactive elements.',
    url: 'https://acmetel.com/understanding-rcs-messaging-and-5-ways-its-improving-the-telecom-experience/',
    date: '2024-09-06',
    image: { src: 'https://acmetel.com/wp-content/uploads/2024/09/Transforming-Telecom-with-RCS-Messaging.jpg', width: 1280, height: 720, alt: 'Transforming telecom with RCS messaging' },
    topic: 'Messaging',
  },
  {
    title: 'What is Omni Channel Marketing and How to Develop a Successful Omni Channel Strategy',
    summary: 'Omnichannel marketing puts the customer first, with a seamless, personalised experience across social media, SMS, email, WhatsApp, voice, RCS and messaging apps.',
    url: 'https://acmetel.com/what-is-omni-channel-marketing-and-how-to-develop-a-successful-omni-channel-strategy/',
    date: '2024-08-02',
    image: { src: 'https://acmetel.com/wp-content/uploads/2024/08/Omni-Channel-Strategy.jpg', width: 1280, height: 720, alt: 'Omnichannel strategy' },
    topic: 'Messaging',
  },
];

// --- WordPress (optional, build time) ---------------------------------------------------------------------------
interface WpPost {
  date: string; link: string; sticky: boolean;
  title: { rendered: string }; excerpt: { rendered: string };
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string; alt_text?: string; media_details?: { width: number; height: number } }[];
    'wp:term'?: { taxonomy: string; name: string }[][];
  };
}
const ENTITIES: Record<string, string> = { '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&#8211;': '–', '&#8212;': '—', '&#8230;': '…', '&hellip;': '…', '&amp;': '&', '&nbsp;': ' ', '&#038;': '&' };
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, (e) => ENTITIES[e] ?? e).replace(/\[…\]/g, '').replace(/\s+/g, ' ').trim();
/** First one or two sentences of the excerpt, at most ~220 characters. */
const shorten = (s: string) => {
  const sentences = s.match(/[^.!?…]+[.!?…]+/g) ?? [s];
  let out = '';
  for (const x of sentences) { if ((out + x).length > 220 && out) break; out += x; }
  return out.trim();
};
const fromWp = (p: WpPost): BlogPost | null => {
  const m = p._embedded?.['wp:featuredmedia']?.[0];
  if (!m) return null; // cards need an image
  const title = text(p.title.rendered);
  const topic = p._embedded?.['wp:term']?.flat().find((t) => t.taxonomy === 'category' && t.name !== 'Uncategorized')?.name;
  return {
    title, summary: shorten(text(p.excerpt.rendered)), url: p.link, date: p.date.slice(0, 10), topic, featured: p.sticky,
    image: { src: m.source_url, width: m.media_details?.width ?? 1280, height: m.media_details?.height ?? 720, alt: m.alt_text && m.alt_text.length < 140 ? m.alt_text : title },
  };
};

/** Newest first. From WordPress when WP_API_URL is set at build time, otherwise the local list. */
export async function getPosts(limit = 7): Promise<BlogPost[]> {
  const base = import.meta.env.WP_API_URL ?? process.env.WP_API_URL;
  if (base) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=${limit}&_embed=wp:featuredmedia,wp:term`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`${res.status}`);
      const posts = ((await res.json()) as WpPost[]).map(fromWp).filter((p): p is BlogPost => !!p);
      if (posts.length) return posts;
    } catch (e) {
      console.warn(`[blog] WordPress fetch failed (${(e as Error).message}); using the local posts.`);
    }
  }
  return localPosts.slice(0, limit);
}

/** Splits posts into the large card and the grid: featured posts first, then the rest, newest first. */
export function arrangePosts(posts: BlogPost[], gridCount = 3) {
  const featured = posts.filter((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);
  const lead = featured[0] ?? rest[0];
  const grid = [...featured.slice(1), ...rest.filter((p) => p !== lead)].slice(0, gridCount);
  return { lead, grid };
}

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
