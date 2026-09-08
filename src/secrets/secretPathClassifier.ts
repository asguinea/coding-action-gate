import {
  normalizePathForSensitivity,
  pathPatternMatches
} from "../paths/pathPatternMatching.js";
import type { SecretPathFinding } from "./secretTypes.js";

interface SecretPathPatternDefinition {
  name: string;
  credentialFileType: string;
  confidence: SecretPathFinding["confidence"];
  patterns: string[];
}

export const defaultSecretPathPatterns: SecretPathPatternDefinition[] = [
  {
    name: "env_file",
    credentialFileType: "env_file",
    confidence: "confirmed",
    patterns: [".env", ".env.*", "**/.env", "**/.env.*"]
  },
  {
    name: "ssh_credentials",
    credentialFileType: "ssh_credentials",
    confidence: "confirmed",
    patterns: [".ssh/**", "**/.ssh/**"]
  },
  {
    name: "private_key_file",
    credentialFileType: "private_key",
    confidence: "confirmed",
    patterns: ["*.pem", "*.key", "*.p12", "*.pfx", "id_rsa", "id_ed25519"]
  },
  {
    name: "cloud_credentials",
    credentialFileType: "cloud_credentials",
    confidence: "confirmed",
    patterns: [
      ".aws/**",
      "**/.aws/**",
      ".gcloud/**",
      "**/.gcloud/**",
      ".azure/**",
      "**/.azure/**"
    ]
  },
  {
    name: "kubeconfig",
    credentialFileType: "kubeconfig",
    confidence: "confirmed",
    patterns: ["kubeconfig", "**/kubeconfig"]
  },
  {
    name: "credentials_json",
    credentialFileType: "credentials_json",
    confidence: "confirmed",
    patterns: ["credentials.json", "**/credentials.json"]
  },
  {
    name: "secrets_file",
    credentialFileType: "secrets_file",
    confidence: "confirmed",
    patterns: [
      "secrets/**",
      "**/secrets/**",
      "secrets.*",
      "**/secrets.*",
      "tokens.*",
      "**/tokens.*"
    ]
  },
  {
    name: "certificate_file",
    credentialFileType: "certificate_file",
    confidence: "possible",
    patterns: ["*.crt"]
  }
];

export const classifySecretPath = (
  pathValue: string
): SecretPathFinding | undefined => {
  const normalizedPath = normalizePathForSensitivity(pathValue);

  for (const definition of defaultSecretPathPatterns) {
    if (
      definition.patterns.some((pattern) =>
        pathPatternMatches(normalizedPath, pattern)
      )
    ) {
      return {
        patternName: definition.name,
        credentialFileType: definition.credentialFileType,
        confidence: definition.confidence
      };
    }
  }

  return undefined;
};
