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
};
