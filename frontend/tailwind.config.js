/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy palette (kept for backward compatibility)
        background: "#F7F7F7",
        primary: "#FF385C",
        secondary: "#222222",
        card: "#FFFFFF",
        border: "#E5E7EB",
        textPrimary: "#222222",
        textSecondary: "#6B7280",
        // Kiirus brand palette
        kiirus: {
          black:       "#000000",
          dark:        "#0f0f0f",
          yellow:      "#d4a017",
          yellowLight: "#f2c94c",
          gray:        "#1a1a1a",
        },
      },
      borderRadius: {
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
