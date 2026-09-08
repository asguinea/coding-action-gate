# Schema Lock: Prefix Extraction v0

This schema lock covers the tiny sampled CodeTraceBench prefix-preview pipeline for the offline intervention workspace.

This is not production StepHarbor validation. It does not claim StepHarbor is conformal and does not claim production statistical guarantees.

## Artifact Archive Format

The sampled CodeTraceBench artifacts are `tar.zst` archives. Batch 2.5 assumes sampled artifacts can be listed and read with local `tar` support for Zstandard-compressed tar archives.

## Internal Trajectory And Log Files Used

Two sampled layouts are currently supported:

- SWE-like `mini-SWE-agent` artifacts use `agent-logs/mini.traj.json` as the primary ordered message source.
- TerminalBench-like `Terminus2` artifacts use `agent-logs/episode-*/response.txt` as action text and the following episode's `prompt.txt` as observation text.

Other files such as `debug.json`, `results.json`, terminal session logs, and pane files may exist, but they are not the authoritative source for the current prefix preview.

## Step Ordering Rule

For SWE-like artifacts, assistant/user message pairs in `mini.traj.json` define ordered steps. For TerminalBench-like artifacts, `episode-N/response.txt` maps to step `N + 1`, and the observation for that step is taken from `episode-(N + 1)/prompt.txt` when available.

Recovered steps are bounded by manifest `step_count`. Archive episodes beyond manifest `step_count` are counted as overrun parts and excluded from prefix examples.

## Label Mapping Rule

Manifest `incorrect_stages` is the authoritative source for incorrect and unuseful labels. Labels are attached by `step_id`. Mapping evidence is checked through `action_ref.path` and `observation_ref.path` after normalizing artifact paths, including removal of the leading `traj/` prefix when archive members omit it.

## Target Construction Rule

For every valid prefix ending at step `t`, the example target is:

- `next_step_bad = 1` if step `t + 1` is labeled incorrect or unuseful;
- `next_step_bad = 0` otherwise.

Secondary targets are:

- `next_step_incorrect`;
- `next_step_unuseful`;
- `current_step_bad`;
- `current_step_incorrect`;
- `current_step_unuseful`;
- `trajectory_has_any_bad_step`.

No target-step action text, target-step observation text, or future labels may be used as features for the prefix ending at step `t`.

## Privacy Rule For Derived JSONL

`data/processed/prefix_preview.jsonl` must not store full raw action text, full raw observation text, raw code, prompts, responses, or content fields. It may store hashes, lengths, keyword counts, coarse kind guesses, stage indices, metadata, and labels.

Markdown validation reports may include short capped snippets solely for manual review.

## Support For Later Conformal Risk-Control Experiments

The schema is designed to support a later conformal risk-control experiment without claiming that the current Batch 2.5 package is conformal:

- prefix examples expose risk-model features available up to and including step `t`;
- targets represent whether allowing continuation into step `t + 1` would allow incorrect or unuseful behavior;
- derived data can support calibration-based threshold selection for `ALLOW` versus `DEFER` decisions;
- intended target allowed-bad-step risks are alpha in `{0.05, 0.10, 0.20}`.

Future batches must define train/calibration/test splits before any calibration or risk-control claim is made.

## Batch 3 Pilot Scaling Status

The Batch 2.5 schema lock is approved for bounded pilot scaling. Batch 3 must keep using this schema unless extraction uncovers a concrete bug. If a bug requires a schema change, this document must be updated before regenerating affected derived outputs.

Batch 3 pilot extraction did not change the locked prefix schema. It did expose additional artifact layouts that are not yet authoritative under this lock; unsupported layouts may parse as zero-prefix trajectories until a later schema revision adds explicit ordering rules for them.

## Prefix Extraction Schema v0.2

Batch 4 hardens parser coverage for the bounded 50-artifact pilot while preserving the target, privacy, and no-future-leakage rules above. The schema remains pre-modeling infrastructure only: no production StepHarbor validation, no conformal claim, and no production statistical guarantee.

Newly supported parser adapters:

- `mini_swe_generic_traj_json`: detects `.traj.json` members beyond the exact `mini.traj.json` name; uses the first message-list trajectory, pairs assistant messages with the immediately following message, and attaches manifest labels by 1-indexed step id.
- `swe_agent_traj`: detects SWE-agent `.traj` JSON files with a `trajectory` list; rows define ordered steps, `action` is action text, and `observation` is observation text. One pilot SWE-agent artifact still has a manifest/artifact step-count mismatch and remains zero-prefix after bounding.
- `openhands_events`: detects `sessions/.../events/N.json` files; sorted agent action events define ordered steps, and each observation is the event whose `cause` equals the action event id.

The existing adapters remain supported:

- `mini_swe_mini_traj`;
- `terminus_episode`.

Batch 4 also changed tar handling for `tar.zst` archives: if system `tar` emits valid stdout but exits nonzero at stream end, listing/extraction can proceed. The two Batch 3 tar-listing failures were diagnosed as script/tooling issues, not corrupted local cache.

Batch 3 parser limitations are mostly reduced for the pilot: 46 of 50 trajectories now produce prefix examples. Remaining open cases are explicitly reported in `reports/pilot_failure_taxonomy.json`.

## Batch 5 Pilot Freeze Status

Batch 5 adds automated pre-modeling QA and freezes the bounded pilot outputs. The quality gate checks coverage, dataset utility, raw-text exclusion, no-future-leakage, label integrity, split quality, and schema consistency. The pilot freeze manifest records script commands, schema version, output paths, and SHA256 hashes for key generated files.

Batch 5 adds `current_step_incorrect` and `current_step_unuseful` to the processed prefix rows so `current_step_bad` can be audited as `current_step_incorrect OR current_step_unuseful`. These fields are labels/targets only and are prohibited from model features.

The current pilot readiness decision is documented in `reports/pilot_quality_gate.json` and `reports/pilot_quality_gate.md`.

## Batch 6 Verified Dry-Run Status

Batch 6 preserves `Prefix Extraction Schema v0.2`. No v0.3 parser assumption is introduced unless the verified-scale dry run discovers a concrete extraction bug requiring a schema update.

The verified extraction uses the same supported layout families, target construction rule, privacy rule, and no-future-leakage rule documented above. Verified-scale outputs are sharded to reduce single-file failure risk, but this packaging change does not change the prefix schema.

The verified dry run remains pre-modeling infrastructure only: no production StepHarbor validation, no conformal claim, and no production statistical guarantee. Later conformal risk-control experiments must use calibration data for threshold selection before any allowed-bad-step risk statement is made.

## Prefix Extraction Schema v0.3

Batch 6.5 adds one verified-scale parser adapter after machine clustering of unsupported verified layouts. This remains pre-modeling infrastructure only: no production StepHarbor validation, no conformal claim, and no production statistical guarantee.

Newly supported layout family:

- `openhands_tensorblock`: detects timestamped OpenHands raw `tensorblock__*.json` request/response files. Files are ordered by the embedded timestamp in the archive member path. Each tensorblock response defines one ordered action step. The action source is `response.choices[0].message` from the current tensorblock file. The observation source is the set of newly appended non-assistant messages in the next tensorblock request after the current response. This is deterministic enough for prefix extraction because the next request contains the tool/user feedback generated after the current response, while the next response is not used as the current observation.

The v0.3 label mapping rule remains manifest-step based:

- manifest `incorrect_stages` `step_id` values are attached to recovered 1-indexed tensorblock response steps;
- path-reference evidence is recorded when present, but the raw tensorblock layout frequently does not expose the same manifest ref paths as episode-style artifacts;
- labels beyond recovered or manifest-bounded steps remain counted as malformed/unmapped and are reported in the verified audit.

The v0.3 privacy and leakage rules are unchanged:

- derived JSONL must not store full raw action text, observation text, prompts, responses, content, or code;
- prefix features for step `t` may use only information available through step `t`;
- the target step `t + 1` action/observation text and future labels must not be used as features;
- the adapter stores hashes, lengths, keyword counts, coarse kind guesses, metadata, and labels only.

Remaining unsupported layout caveats:

- layouts that expose only unstructured `agent.log`, terminal cast files, patches, or run logs remain excluded unless a later batch finds an authoritative step-order and action/observation contract;
- low-frequency OpenHands variants without timestamped tensorblocks or numeric event streams remain documented unsupported layouts;
- schema v0.3 is acceptable for verified extraction only if automated QA confirms raw-text exclusion, no-future-leakage, positive-target traceability, and trajectory-level split isolation.

This schema still supports later conformal risk-control experiments by producing leakage-safe prefix examples and next-step targets that can later be split into train, calibration, and test sets. Any later ALLOW/DEFER thresholding for alpha in `{0.05, 0.10, 0.20}` must be calibrated on calibration data before a risk-control statement is made.

## Prefix Extraction Schema v0.4

Batch 6.75 makes one narrow parser fix for an already-supported layout. It does not add a speculative parser family. This remains pre-modeling infrastructure only: no production StepHarbor validation, no conformal claim, and no production statistical guarantee.

Changed existing adapter:

- `swe_agent_traj`: the authoritative file remains the first SWE-agent `.traj` JSON member with a `trajectory` list. Rows still define 1-indexed steps, `action` remains the action source, and `observation` remains the observation source. The label mapping rule remains manifest `incorrect_stages` `step_id` to recovered 1-indexed rows. Batch 6.75 increases the `.traj` read bound to 100 MB because 11 verified SWE-agent artifacts had valid large `.traj` files that were truncated by the previous 10 MB parser read cap.

Why this is deterministic enough:

- the layout and row schema were already supported under v0.2/v0.3;
- inspection showed valid `trajectory` lists with action/observation fields, or files likely truncated by the old read cap;
- no new raw patch, code, prediction, or terminal side files are used;
- the step ordering, action source, observation source, label mapping, privacy rule, and no-future-leakage rule remain unchanged.

Remaining unsupported caveats after v0.4:

- the eight manifest rows with missing `artifact_path` remain excluded unless exact remote paths are recovered from an authoritative listing;
- 70 unsupported verified layouts remain documented exclusions because they lack a deterministic non-speculative action/observation contract;
- no supported-layout zero-prefix cases remain after the v0.4 verified rerun.

## Known Caveats

- 33 manifest rows have unresolved or missing `artifact_path` values.
- Source inference is heuristic and still requires manual review.
- Archive episodes may exceed manifest `step_count`; the current parser bounds extraction to manifest `step_count`.
- Manual confirmation is optional for documented unsupported layouts; automated QA is authoritative for leakage, privacy, label integrity, and split leakage checks.
- Current step recovery support covers `mini_swe_mini_traj`, `mini_swe_generic_traj_json`, `terminus_episode`, `swe_agent_traj`, `openhands_events`, and `openhands_tensorblock` layouts. Remaining unsupported layouts are documented by failure taxonomy reports and should not block modeling if verified QA returns `READY_FOR_BASELINE_MODELING` or `READY_WITH_CAVEATS`.
