/**
 * Sweet Eye design tokens — "espresso noir & crema".
 * Brand colours come from the website's Tailwind theme (primary #5C2E1F,
 * accent #D4A373, coffee-dark #1A0F0A, cream #F5F1EC), pushed into a dark,
 * editorial palette for the app.
 */
export const colors = {
  bg: '#0E0806',
  bgSoft: '#140C08',
  surface: '#1B110C',
  surfaceHigh: '#24170F',
  card: '#20140E',
  line: 'rgba(231, 195, 158, 0.12)',
  lineStrong: 'rgba(231, 195, 158, 0.24)',

  cream: '#F5EDE3',
  creamSoft: 'rgba(245, 237, 227, 0.72)',
  creamMuted: 'rgba(245, 237, 227, 0.5)',
  creamFaint: 'rgba(245, 237, 227, 0.28)',

  gold: '#D4A373',
  goldLight: '#E7C39E',
  goldDeep: '#A6703B',
  goldGlow: 'rgba(212, 163, 115, 0.22)',

  brown: '#5C2E1F',
  brownLight: '#8B5E3C',
  espresso: '#120A06',

  success: '#8FC79B',
  successBg: 'rgba(143, 199, 155, 0.12)',
  danger: '#EE8E7A',
  dangerBg: 'rgba(238, 142, 122, 0.12)',
  info: '#9DB8E8',
  overlay: 'rgba(8, 4, 2, 0.6)',
} as const;

export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displaySemi: 'PlayfairDisplay_600SemiBold',
  displayRegular: 'PlayfairDisplay_400Regular',
  displayItalic: 'PlayfairDisplay_400Regular_Italic',
  displayBoldItalic: 'PlayfairDisplay_700Bold_Italic',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

/** Content never grows wider than this (tablets / desktop web). */
export const MAX_WIDTH = 1180;

export const shadow = {
  glow: {
    shadowColor: '#D4A373',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
} as const;

/** Spring presets used across the app so motion feels consistent. */
export const springs = {
  snappy: { damping: 18, stiffness: 260, mass: 0.8 },
  soft: { damping: 22, stiffness: 140, mass: 1 },
  bouncy: { damping: 11, stiffness: 220, mass: 0.7 },
} as const;
