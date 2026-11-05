const ARROWS: [RegExp, string][] = [
  [/\bdf\b/g, '↘'],
  [/\bdb\b/g, '↙'],
  [/\buf\b/g, '↗'],
  [/\bub\b/g, '↖'],
  [/\bf\b/g, '→'],
  [/\bb\b/g, '←'],
  [/\bd\b/g, '↓'],
  [/\bu\b/g, '↑'],
];

/** 'df+2' → '↘+2' (방향 기호를 화살표로) */
export function notationArrows(n: string): string {
  return ARROWS.reduce((s, [re, a]) => s.replace(re, a), n);
}
