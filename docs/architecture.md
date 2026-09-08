# Architecture

StepHarbor evaluates a structured proposal before an external caller applies an action. The caller remains responsible for enforcing the result.

```text
Proposed action → normalization → evidence and risk detectors → policy decision
                                                            ↓
                                                 audit record + repair plan
                                                            ↓
                                                   CLI / local dashboard
```

The decision engine combines configured rules with computed signals. Observations bind reads to file state; a later mutation can invalidate that evidence. A deferred action can be retried after its missing context is gathered. Validation records contribute evidence for landing actions such as commits and pushes.

Runtime state is local to `.stepharbor/`: observations, validation records, deferred actions, audit records, and optional local analytics. Hash chaining can reveal audit-log modification relative to a trusted prior hash; it is not externally anchored proof of authenticity.

The dashboard consumes read-only local endpoints. It does not approve actions or modify policies. The API and dashboard should remain bound to loopback.

The Python controller experiments are independent of the runtime. They explore selection over finite policy grids using separate calibration and test observations. They do not add statistical authority to runtime decisions.
