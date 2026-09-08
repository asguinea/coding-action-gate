import { createRequire } from "node:module";

interface PackageJson {
  version: string;
}

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as PackageJson;

export const stepharborVersion = packageJson.version;

export const formatStepHarborVersion = (): string =>
  `StepHarbor ${stepharborVersion}`;
