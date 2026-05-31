/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — must match the existing client PDF.
        'brand-green': '#2F6B3A', // primary turf
        'brand-green-light': '#6FA86B',
        'brand-green-pale': '#D8E6CF',
        'brand-green-soft': '#EEF3E8',
        'brand-sand': '#C9A271', // warm accent
        'brand-terra': '#A84B2F', // loss / critical
        'brand-gold': '#D19900', // warning
        ink: '#1E2A1F',
        'ink-muted': '#5F6B5F',
        'ink-faint': '#8E978D',
        'bg-cream': '#FBFAF5',
        surface: '#FFFFFF',
        'border-soft': '#D4D1CA',
        'border-faint': '#E8E5DD',
      },
      fontFamily: {
        // Default body font: DM Sans. Headings: Inter.
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        heading: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(30, 42, 31, 0.04), 0 4px 16px rgba(30, 42, 31, 0.05)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
