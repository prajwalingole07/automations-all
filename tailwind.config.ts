import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Segoe UI Variable Text",
          "Segoe UI",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: ["Cascadia Code", "JetBrains Mono", "Consolas", "monospace"],
      },
      colors: {
        ink: {
          950: "#04060c",
          900: "#070b14",
          800: "#0b1220",
          700: "#111b2e",
        },
        mint: "#34d399",
        aqua: "#22d3ee",
        iris: "#818cf8",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,238,.18), 0 24px 70px -30px rgba(34,211,238,.35)",
        panel: "0 1px 0 rgba(255,255,255,.04) inset, 0 30px 70px -45px rgba(0,0,0,.95)",
      },
      backgroundImage: {
        "radial-fade":
          "radial-gradient(60% 60% at 50% 0%, rgba(34,211,238,.13), transparent 70%)",
        "grid-lines":
          "linear-gradient(rgba(148,163,184,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.05) 1px, transparent 1px)",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        spinSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        fadeUp: "fadeUp .5s cubic-bezier(.2,.8,.2,1) both",
        fadeIn: "fadeIn .4s ease both",
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        spinSlow: "spinSlow 30s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
