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

/** Row 2 (moves right): partners, carriers, technology. Names as on acmetel.com. */
export const partners: BeltLogo[] = [
  { name: 'omantel', src: '/logos/partners/omantel.svg', mono: '/logos/partners/omantel-mono.svg' },
  { name: 'Zain', src: '/logos/partners/zain.svg', mono: '/logos/partners/zain-mono.svg' },
  { name: 'airtel', src: '/logos/partners/airtel.svg', mono: '/logos/partners/airtel-mono.svg' },
  { name: 'BICS', src: '/logos/partners/bics.svg', mono: '/logos/partners/bics-mono.svg' },
  // Orange Jordan uses the standard Orange square mark.
  { name: 'Orange', src: '/logos/partners/orange.svg', mono: '/logos/partners/orange-mono.svg', square: true },
  // PLACEHOLDER: PTCL is a partner on acmetel.com but has no file yet (ptcl.com.pk was unreachable when the logos
  // were collected). Add { name: 'PTCL', src, mono } here once the official file is in public/logos/partners/.
  { name: 'Twilio', src: '/logos/partners/twilio.svg', mono: '/logos/partners/twilio-mono.svg' },
  { name: 'Zong', src: '/logos/partners/zong.svg', mono: '/logos/partners/zong-mono.svg' },
  // PLACEHOLDER: the source copy flags Duo vs du as unconfirmed; this is Cisco Duo (duo.com). Confirm with the client.
  { name: 'Duo', src: '/logos/partners/duo.svg', mono: '/logos/partners/duo-mono.svg' },
  { name: 'TikTok', src: '/logos/partners/tiktok.svg', mono: '/logos/partners/tiktok-mono.svg' },
  { name: 'Etisalat Misr', src: '/logos/partners/etisalat-misr.svg', mono: '/logos/partners/etisalat-misr-mono.svg' },
];
