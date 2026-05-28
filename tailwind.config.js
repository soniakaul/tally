/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    {
      pattern:
        /^(bg|text)-(sage|moss|forest|olive|amber|tan|walnut|clay|terracotta|slate-warm|rose|coral|rust|plum|mustard|ochre)(-soft)?$/,
    },
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F4F2EA',
        card: '#EBE8DE',
        edge: '#DDD9CB',
        ink: '#0A0A0A',
        'ink-muted': '#5C5A52',
        'ink-faint': '#8F8C81',
        sage: '#4F7A4F',
        'sage-soft': '#E2EBDB',
        amber: '#C68B3A',
        'amber-soft': '#F2E3C7',
        ochre: '#8A5A28',
        'ochre-soft': '#E8D5B8',
        olive: '#7A7A47',
        'olive-soft': '#E5E2C8',
        tan: '#A88060',
        'tan-soft': '#EAD9C6',
        moss: '#5C7A3D',
        'moss-soft': '#DCE4C9',
        terracotta: '#B86B47',
        'terracotta-soft': '#EFCFBE',
        walnut: '#6B4E2E',
        'walnut-soft': '#DCCCB8',
        clay: '#B6755E',
        'clay-soft': '#ECD2C6',
        forest: '#3D5C2E',
        'forest-soft': '#D2DCC1',
        'slate-warm': '#6E6B5E',
        'slate-warm-soft': '#D8D6CD',
        rose: '#C77A8A',
        'rose-soft': '#EFD2D9',
        coral: '#D08070',
        'coral-soft': '#EFD6CD',
        rust: '#A05030',
        'rust-soft': '#E5CFC0',
        plum: '#7A5D6B',
        'plum-soft': '#D9CFD4',
        mustard: '#B89530',
        'mustard-soft': '#E8DDB8',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      backgroundImage: {
        dots: 'radial-gradient(circle, #D9D5C7 1px, transparent 1px)',
      },
      backgroundSize: {
        'dots-grid': '18px 18px',
      },
    },
  },
  plugins: [],
}
