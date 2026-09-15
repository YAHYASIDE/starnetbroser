/** Jest config for @starnet/api - ts-jest, runs real tests against local Postgres. */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["src/**/*.(t|j)s"],
  testEnvironment: "node",
  // @starnet/shared resolves through a workspace symlink outside node_modules,
  // so its compiled dist/*.js needs explicit exclusion from ts-jest transform.
  transformIgnorePatterns: ["/node_modules/", "packages/shared/dist"],
};
