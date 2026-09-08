export const canReadFixtureRecord = (role: "reader" | "owner"): boolean =>
  role === "owner";
