/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: "#7c3aed", // Vibrant Violet
        "background-light": "#f3f4f6", // Cool Gray 100
        "background-dark": "#0f0e17", // Very dark violet/black
        "surface-light": "#ffffff",
        "surface-dark": "#1b1b2f", // Dark Indigo surface
        "accent-cyan": "#06b6d4",
        "accent-pink": "#ec4899",
        "accent-yellow": "#eab308",
        "accent-red": "#ef4444",
      },
      fontFamily: {
        display: ["Orbitron", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      boxShadow: {
        'neon': '0 0 10px rgba(124, 58, 237, 0.5)',
        'neon-cyan': '0 0 10px rgba(6, 182, 212, 0.5)',
      }
    },
  },
  plugins: [],
}






