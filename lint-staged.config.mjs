export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": "eslint --fix",
  "apps/api/**/*.{ts,tsx}": () => "npm run typecheck -w @twitch-radar/api",
  "apps/web/**/*.{ts,tsx}": () => "npm run typecheck -w @twitch-radar/web",
  "apps/web/public/locales/*.json": () => "npm run check-i18n",
  "*": "prettier --write --ignore-unknown",
}
