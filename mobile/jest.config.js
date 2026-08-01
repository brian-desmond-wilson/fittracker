/** Jest is scoped to pure TypeScript libs only (no React Native imports). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/theme/**/*.test.ts"],
};
