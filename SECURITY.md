# Security policy

CodingActionGate 0.1.x is experimental. Security fixes are developed against the current default branch; there is no long-term support commitment.

If you find a vulnerability, use the repository's **Security → Report a vulnerability** option when enabled. Include a minimal synthetic reproduction, affected version, expected behavior, and impact. Do not include real credentials or private source code in an issue. If private reporting is unavailable, open an issue asking for a private contact channel without disclosing exploit details.

Read the [execution boundary and threat model](docs/limitations.md). The authorization engine is not a process sandbox. A caller that ignores or bypasses a decision is outside the enforced boundary.
