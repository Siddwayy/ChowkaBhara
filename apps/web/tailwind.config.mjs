/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sky: {
          DEFAULT: "#0B1F3A",
          mid: "#123A56",
          soft: "#1A4D6B",
        },
        surface: {
          DEFAULT: "#FFF8F0",
          muted: "#F0E6D8",
          card: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#0B1F3A",
          soft: "#3D5A73",
          faint: "#6B8499",
        },
        o2: {
          DEFAULT: "#2EC4B6",
          dark: "#1A9E92",
          light: "#7EE8DE",
        },
        danger: {
          DEFAULT: "#FF6B4A",
          dark: "#E04A2A",
          soft: "#FFE0D8",
        },
        warn: {
          DEFAULT: "#FFB020",
          soft: "#FFF0C8",
        },
        // Player pawn colors (4th color adds a friendly blue).
        pawn: {
          red: "#FF6B4A",
          blue: "#3B82F6",
          green: "#2EC4B6",
          yellow: "#FFB020",
        },
      },
      fontFamily: {
        display: ['"Fredoka"', "system-ui", "sans-serif"],
        sans: ['"Fredoka"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 24px rgba(11, 31, 58, 0.12)",
        pop: "0 4px 0 rgba(11, 31, 58, 0.15)",
        token: "0 3px 6px rgba(11, 31, 58, 0.35), inset 0 2px 3px rgba(255,255,255,0.45)",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.02)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        popIn: {
          from: { opacity: "0", transform: "scale(0.4)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shellRoll: {
          "0%": { transform: "rotate(-12deg) translateY(0)" },
          "50%": { transform: "rotate(10deg) translateY(-6px)" },
          "100%": { transform: "rotate(0deg) translateY(0)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.8s ease-in-out infinite",
        fadeIn: "fadeIn 0.35s ease-out",
        bob: "bob 2.4s ease-in-out infinite",
        popIn: "popIn 0.3s ease-out",
        shellRoll: "shellRoll 0.5s ease-out",
      },
    },
  },
  plugins: [],
};
