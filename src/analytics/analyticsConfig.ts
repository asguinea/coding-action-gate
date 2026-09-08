const disabledValues = new Set(["0", "false", "off"]);

export const isAnalyticsEnabled = (
  env: NodeJS.ProcessEnv = process.env
): boolean => {
  const value = env["CODING_ACTION_GATE_ANALYTICS"];

  if (value === undefined) {
    return true;
  }

  return !disabledValues.has(value.trim().toLowerCase());
};
