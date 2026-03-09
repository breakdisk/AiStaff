import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist Sans", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        sm:  "2px",
        DEFAULT: "2px",
        md:  "4px",
        lg:  "6px",
      },
      colors: {
        // Overrides — zinc is the design system base
      },
    },
  },
  plugins: [],
};

export default config;
