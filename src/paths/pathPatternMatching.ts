const globMagicPattern = /[*?[\]{}]/;

const escapeRegex = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

export const normalizePathForSensitivity = (pathValue: string): string => {
  const withForwardSlashes = pathValue.replace(/\\/g, "/");
  const segments: string[] = [];

  for (const segment of withForwardSlashes.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/") || ".";
};

const globSegmentToRegex = (segment: string): string => {
  let regex = "";

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index] ?? "";

    if (char === "*") {
      regex += "[^/]*";
    } else if (char === "?") {
      regex += "[^/]";
    } else {
      regex += escapeRegex(char);
    }
  }

  return regex;
};

const globToRegexSource = (pattern: string): string => {
  const segments = pattern.split("/");
  let source = "";

  segments.forEach((segment, index) => {
    if (segment === "**") {
      source += index === segments.length - 1 ? "(?:/.*)?" : "(?:.*/)?";
      return;
    }

    if (index > 0 && segments[index - 1] !== "**") {
      source += "/";
    }

    source += globSegmentToRegex(segment);
  });

  return source;
};

export const pathPatternMatches = (
  pathValue: string,
  patternValue: string
): boolean => {
  const targetPath = normalizePathForSensitivity(pathValue);
  const pattern = normalizePathForSensitivity(patternValue);
  const hasSlash = pattern.includes("/");
  const hasGlobMagic = globMagicPattern.test(pattern);

  if (!hasSlash && !hasGlobMagic) {
    const basename = targetPath.split("/").at(-1);

    return targetPath === pattern || basename === pattern;
  }

  const regexSource = globToRegexSource(pattern);
  const regex = new RegExp(
    hasSlash ? `^${regexSource}$` : `^(?:.*/)?${regexSource}$`
  );

  return regex.test(targetPath);
};
