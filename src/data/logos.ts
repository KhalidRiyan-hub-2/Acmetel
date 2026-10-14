// Brand belt data. Each logo has an official full-colour file (`src`) and a monochrome version (`mono`, recoloured
// to the ink token) in public/logos/. Entries without files render as text wordmarks.
// Sources and licences: public/logos/CREDITS.md.

export interface BeltLogo {
  name: string;
  /** Official full-colour file. */
  src?: string;
  /** Monochrome version (ink on transparent). */
  mono?: string;
  /** Square marks read smaller than wordmarks at the same height; this bumps them up. */
  square?: boolean;
}

/**
 * Which version the belt shows. PLACEHOLDER: pending review and final selection (both sets are on disk).
 * 'mono'  — every logo in ink at reduced opacity, full opacity on hover. Calm, consistent with the dark UI.
 * 'color' — official colours on light tiles (stc purple and Sinch black need a light ground to read).
 */
export const logoStyle: 'mono' | 'color' = 'mono';

/** Row 1 (moves left). Copy source: home-current-site.md "Our Partners (logos)". */
export const operators: BeltLogo[] = [
  { name: 'Mobily', src: '/logos/operators/mobily.svg', mono: '/logos/operators/mobily-mono.svg', square: true },
  // PLACEHOLDER: listed as "e&" in the source copy; the group returned to the etisalat name on 6 Oct 2026 and
  // eand.com now uses this etisalat wordmark. Confirm the name and logo with the client.
  { name: 'etisalat', src: '/logos/operators/etisalat.svg', mono: '/logos/operators/etisalat-mono.svg' },
  // PLACEHOLDER: du publishes no logo file; this is the Wikimedia Commons trace (CC BY-SA 4.0, see CREDITS.md).
  // Replace with the brand-approved file from the client.
  { name: 'du', src: '/logos/operators/du.png', mono: '/logos/operators/du-mono.svg', square: true },
  { name: 'Sinch', src: '/logos/operators/sinch.svg', mono: '/logos/operators/sinch-mono.svg' },
  { name: 'stc', src: '/logos/operators/stc.svg', mono: '/logos/operators/stc-mono.svg' },
];

/** Row 2 (moves right): partners and carriers. Names from home-current-site.md (logos on the acmetel.com home page).
 *  PLACEHOLDER: pending review and final selection with the client, like row 1. Not included yet (confirm with the
 *  client): Duo, TikTok, Etisalat Misr. PTCL has no file (its sites were unreachable when sourcing), so it renders as
 *  a text wordmark until the brand file is supplied. Sources: public/logos/CREDITS.md. */
const p = (name: string, file: string, square = false): BeltLogo =>
  ({ name, src: `/logos/partners/${file}.svg`, mono: `/logos/partners/${file}-mono.svg`, square });
export const partners: BeltLogo[] = [
  p('Omantel', 'omantel'),
  p('Zain', 'zain'),
  p('airtel', 'airtel', true),
  p('BICS', 'bics', true),
  p('Orange', 'orange', true),
  { name: 'PTCL' },
  p('Twilio', 'twilio'),
  p('Zong', 'zong', true),
];
