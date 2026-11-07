/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "var(--bg)",
        panel: "var(--bg-2)",
        raised: "var(--surface)",
        primary: "var(--text)",
        secondary: "var(--text-2)",
        muted: "var(--text-3)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)"
      },
      maxWidth: {
        shell: "1240px"
      }
    }
  },
  plugins: []
};
