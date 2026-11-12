import type { Config } from "tailwindcss";

/**
 * Tailwind CSS strictly locked to Section 4 colors, 8px spacing grid,
 * 8px corner radius, and 14/16/20/28/40 typography scale.
 * Default Tailwind color palettes are intentionally replaced (not extended).
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      "deep-navy": "#0B2545",
      "trust-blue": "#1E56A0",
      cloud: "#F5F7FA",
      white: "#FFFFFF",
      ink: "#1F2933",
      slate: "#52606D",
      mist: "#CBD2D9",
      "verified-green": "#1B7F5C",
      amber: "#B7791F",
      "brick-red": "#B42318",
      "pale-blue": "#E8EEF6",
    },
    spacing: {
      0: "0px",
      px: "1px",
      2: "8px",
      4: "16px",
      6: "24px",
      8: "32px",
      10: "40px",
      12: "48px",
      16: "64px",
      20: "80px",
      24: "96px",
    },
    borderRadius: {
      none: "0px",
      DEFAULT: "8px",
      md: "8px",
      lg: "8px",
    },
    fontSize: {
      "14": ["14px", { lineHeight: "20px" }],
      "16": ["16px", { lineHeight: "24px" }],
      "20": ["20px", { lineHeight: "28px" }],
      "28": ["28px", { lineHeight: "36px" }],
      "40": ["40px", { lineHeight: "48px" }],
    },
    fontFamily: {
      sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
      serif: ["var(--font-source-serif)", "Georgia", "serif"],
    },
    boxShadow: {
      none: "none",
    },
    extend: {
      transitionDuration: {
        state: "200ms",
      },
      transitionTimingFunction: {
        state: "cubic-bezier(0, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
