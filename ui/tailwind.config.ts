import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Digital Agency "Sumi" (Neutral)
        sumi: {
          50: "#F9F9FA",
          100: "#F2F3F5",
          200: "#E6E8EB",
          300: "#D0D4D9",
          400: "#B4B9C2",
          500: "#949BA6",
          600: "#727985",
          700: "#545B66",
          800: "#3A3F47",
          900: "#24272E",
        },
        // Digital Agency "Sea" (Blue)
        sea: {
          50: "#E8F1FE",
          100: "#D9E6FF",
          200: "#C5D7FB",
          300: "#9DB7F9",
          400: "#7096F8",
          500: "#4979F5",
          600: "#3460FB",
          700: "#264AF4",
          800: "#0031D8",
          900: "#0017C1",
        },
        // Digital Agency "Wood" (Brown/Orange-ish)
        wood: {
          50: "#FAF6F2",
          100: "#F5EDE6",
          200: "#EBDCCC",
          300: "#D6BFA8",
          400: "#BFA388",
          500: "#A6886D",
        },
        // Digital Agency "Sun" (Yellow/Gold)
        sun: {
          50: "#FEF9E8",
          100: "#FEF2D1",
          200: "#FDE6A3",
          300: "#FCD875",
          400: "#FBCA47",
          500: "#FABC19",
        },
        // Digital Agency "Forest" (Green)
        forest: {
          50: "#E9F7EF",
          100: "#D3EFDF",
          200: "#A7DFBF",
          300: "#7BCF9F",
          400: "#4FBF7F",
          500: "#23AF5F",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-noto-sans-jp)",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
