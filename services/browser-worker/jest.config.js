/** Jest config for @starnet/browser-worker - real Chromium/Xvfb/x11vnc/Docker-volume tests. */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/", "packages/shared/dist"],
  testEnvironment: "node",
  testTimeout: 60000,
};
