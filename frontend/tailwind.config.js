/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── AshaKiran v3 Healthcare Palette ──
        primary:        '#0F766E',   // Deep Teal – trust & calm
        'primary-light':'#0d9488',   // Vibrant Teal
        'primary-dark': '#115e59',   // Darker Teal
        accent:         '#F59E0B',   // Warm Orange
        alert:          '#F59E0B',   // Warm Orange
        safe:           '#22c55e',   // Medical Green

        // Surface
        surface:            '#f0f9f9',
        'surface-card':     'rgba(255,255,255,0.85)',

        // Material Design tokens (kept for compat)
        "on-tertiary-fixed-variant":    "#5c686e",
        "outline":                      "#737c80",
        "tertiary-fixed":               "#e9f6fd",
        "on-secondary-fixed-variant":   "#005ea0",
        "surface-bright":               "#f7fafc",
        "on-primary":                   "#ffffff",
        "on-error":                     "#fff7f6",
        "on-background":                "#1a2e2e",
        "on-primary-fixed-variant":     "#0d6e6e",
        "surface-container-low":        "#e8f4f4",
        "on-tertiary-fixed":            "#3f4b51",
        "on-secondary-container":       "#005490",
        "tertiary-container":           "#e9f6fd",
        "surface-container-high":       "#dceaea",
        "secondary-dim":                "#005592",
        "error-container":              "#fee2e2",
        "on-primary-fixed":             "#094f4f",
        "surface-container-highest":    "#d1e5e5",
        "inverse-on-surface":           "#9a9d9f",
        "surface-container":            "#e5f0f0",
        "surface-tint":                 "#0d6e6e",
        "primary-fixed-dim":            "#99e6e6",
        "on-surface-variant":           "#4a6060",
        "on-tertiary-container":        "#515e63",
        "tertiary":                     "#556167",
        "secondary-fixed":              "#d2e4ff",
        "surface-dim":                  "#c8dede",
        "primary-fixed":                "#b2f0f0",
        "surface-variant":              "#d8eaea",
        "on-primary-container":         "#094f4f",
        "inverse-primary":              "#7adcdc",
        "surface":                      "#f0f9f9",
        "error":                        "#ef4444",
        "inverse-surface":              "#0f1f1f",
        "secondary":                    "#0062a6",
        "tertiary-fixed-dim":           "#dae7ee",
        "secondary-container":          "#dbeeff",
        "primary-container":            "#ccf5f5",
        "primary-dim":                  "#0a5858",
        "background":                   "#f0f9f9",
        "secondary-fixed-dim":          "#b9d7ff",
        "on-surface":                   "#1a2e2e",
        "on-tertiary":                  "#f2faff",
        "error-dim":                    "#991b1b",
        "on-secondary":                 "#f7f9ff",
        "outline-variant":              "#a8c4c4",
        "on-error-container":           "#7f1d1d",
        "on-secondary-fixed":           "#004172",
        "surface-container-lowest":     "#ffffff"
      },
      borderRadius: {
        DEFAULT: '1rem',
        lg:     '1.75rem',
        xl:     '2.5rem',
        full:   '9999px',
      },
      fontFamily: {
        sans:        ['Inter', 'Noto Sans', 'sans-serif'],
        display:     ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        headline:    ['Plus Jakarta Sans', 'sans-serif'],
        body:        ['Inter', 'sans-serif'],
        devanagari:  ['Noto Sans Devanagari', 'sans-serif'],
        tamil:       ['Noto Sans Tamil', 'sans-serif'],
        telugu:      ['Noto Sans Telugu', 'sans-serif'],
        kannada:     ['Noto Sans Kannada', 'sans-serif'],
        bengali:     ['Noto Sans Bengali', 'sans-serif'],
        gujarati:    ['Noto Sans Gujarati', 'sans-serif'],
        malayalam:   ['Noto Sans Malayalam', 'sans-serif'],
        gurmukhi:    ['Noto Sans Gurmukhi', 'sans-serif'],
      },
      boxShadow: {
        'glass':    '0 4px 24px rgba(13,110,110,0.08), 0 1px 4px rgba(13,110,110,0.04)',
        'glass-lg': '0 12px 40px rgba(13,110,110,0.14), 0 2px 8px rgba(13,110,110,0.06)',
        'teal':     '0 8px 32px rgba(13,110,110,0.30)',
        'orange':   '0 8px 32px rgba(249,115,22,0.30)',
        'blue':     '0 8px 32px rgba(2,132,199,0.30)',
        'red':      '0 8px 32px rgba(239,68,68,0.25)',
      },
      backdropBlur: {
        glass: '16px',
      }
    },
  },
  plugins: [],
}
