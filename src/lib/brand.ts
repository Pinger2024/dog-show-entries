/**
 * Canonical server-side brand palette — the Show Experience "green" system.
 *
 * For contexts that can't read CSS custom properties (transactional emails,
 * react-pdf documents, satori-rendered share/OG images). This is a mirror
 * of the `--color-se-*` tokens in src/app/globals.css — when one changes,
 * change BOTH together.
 */
export const BRAND = {
  ink: '#1b241d',
  ink2: '#535c4d',
  ink3: '#8a9182',
  line: '#e7e1d3',
  line2: '#d7cfba',
  green: '#2f6b43',
  fresh: '#5bb579',
  freshDeep: '#2f8a52',
  freshSoft: '#e4f2e7',
  honey: '#e6a53a',
  honeyDeep: '#b9781a',
  honeySoft: '#f8ecd4',
  cream: '#f3ecdc',
  paper: '#f6f4ec',
  paper2: '#efe9db',
  deep: '#20452c',
  deepest: '#152e1d',
} as const;
