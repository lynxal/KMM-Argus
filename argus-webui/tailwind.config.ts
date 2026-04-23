import type { Config } from 'tailwindcss';
import tokens from './src/design/tokens.json' with { type: 'json' };

const {
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  spacing,
  height,
  borderRadius,
  boxShadow,
  transitionDuration,
  transitionTimingFunction,
} = tokens as unknown as {
  colors: Record<string, string>;
  fontFamily: Record<string, string>;
  fontSize: Record<string, [string, string]>;
  fontWeight: Record<string, string>;
  letterSpacing: Record<string, string>;
  spacing: Record<string, string>;
  height: Record<string, string>;
  borderRadius: Record<string, string>;
  boxShadow: Record<string, string>;
  transitionDuration: Record<string, string>;
  transitionTimingFunction: Record<string, string>;
};

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  darkMode: ['class', '.theme-dark'],
  theme: {
    extend: {
      colors,
      fontFamily: {
        ui: fontFamily.ui?.split(',').map((s) => s.trim()) ?? [],
        mono: fontFamily.mono?.split(',').map((s) => s.trim()) ?? [],
      },
      fontSize,
      fontWeight,
      letterSpacing,
      spacing,
      height,
      borderRadius,
      boxShadow,
      transitionDuration,
      transitionTimingFunction,
    },
  },
  plugins: [],
};

export default config;
