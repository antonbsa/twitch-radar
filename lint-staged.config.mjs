export default {
  "*.{js,jsx,mjs,cjs,ts,tsx}": "eslint --fix",
  "apps/api/**/*.{ts,tsx}": () => "npm run typecheck -w @twitch-radar/api",
  "apps/web/**/*.{ts,tsx}": () => "npm run typecheck -w @twitch-radar/web",
  "*": "prettier --write --ignore-unknown",
}
