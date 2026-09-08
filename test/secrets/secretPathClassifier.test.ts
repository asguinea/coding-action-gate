import { describe, expect, it } from "vitest";
import { classifySecretPath } from "../../src/secrets/secretPathClassifier.js";

describe("classifySecretPath", () => {
  it("classifies .env as confirmed", () => {
    expect(classifySecretPath(".env")).toMatchObject({
      confidence: "confirmed",
      credentialFileType: "env_file"
    });
  });

  it("classifies .env.local as confirmed", () => {
    expect(classifySecretPath(".env.local")).toMatchObject({
      confidence: "confirmed",
      credentialFileType: "env_file"
    });
  });

  it("classifies .ssh/id_rsa as confirmed", () => {
    expect(classifySecretPath(".ssh/id_rsa")).toMatchObject({
      confidence: "confirmed",
      credentialFileType: "ssh_credentials"
    });
  });

  it("classifies private key files as confirmed", () => {
    expect(classifySecretPath("certs/private.pem")).toMatchObject({
      confidence: "confirmed",
      credentialFileType: "private_key"
    });
  });

  it("classifies credentials.json as confirmed", () => {
    expect(classifySecretPath("credentials.json")).toMatchObject({
      confidence: "confirmed",
      credentialFileType: "credentials_json"
    });
  });

  it("classifies README.md as not secret-bearing", () => {
    expect(classifySecretPath("README.md")).toBeUndefined();
  });

  it("classifies certificate files as possible", () => {
    expect(classifySecretPath("certs/example.crt")).toMatchObject({
      confidence: "possible",
      credentialFileType: "certificate_file"
    });
  });
});
