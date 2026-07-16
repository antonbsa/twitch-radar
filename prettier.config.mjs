export default {
  arrowParens: "always",
  endOfLine: "auto",
  printWidth: 80,
  semi: false,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "all",
  overrides: [
    {
      files: ["*.json", "*.jsonc"],
      options: {
        trailingComma: "none",
      },
    },
  ],
}
