import { canReadFixtureRecord } from "../src/access-control";

export const sensitiveFixtureExpectation = canReadFixtureRecord("owner");
