// Brand belt data. To use a real logo: drop the file in public/logos/... and set `src`.
// Entries without `src` render as text wordmarks.

export interface BeltLogo { name: string; src?: string; href?: string }

/** Row 1 (moves left): operators. Add SVGs at public/logos/operators/<slug>.svg and set src. */
export const operators: BeltLogo[] = [
  { name: 'Mobily' },
  { name: 'e&' },
  { name: 'du' },
  { name: 'Sinch' },
  { name: 'stc' },
];

/** Row 2 (moves right): partners, carriers, technology. PLACEHOLDER: replace the eight files and names. */
export const partners: BeltLogo[] = Array.from({ length: 8 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { name: `Partner ${n}`, src: `/logos/partners/partner-${n}.svg` };
});
