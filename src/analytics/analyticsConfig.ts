const disabledValues = new Set(["0", "false", "off"]);

export const isAnalyticsEnabled = (
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  const value = env["STEPHARBOR_ANALYTICS"];

  if (value === undefined) {
    return true;
  }

  return !disabledValues.has(value.trim().toLowerCase());
};
