/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,js}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Manrope", "DM Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
