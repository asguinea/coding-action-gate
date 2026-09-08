# Scenario benchmark results

Run `npm run reproduce` to regenerate the report for the bundled synthetic inert scenarios. The output is a fixture-based check, not production routing evidence.

The generated report lists each Problem family, expected decisions, observed decisions, and aggregate metrics. Inspect `reproduction/benchmark-metrics.json` and the reference hashes recorded with the reproduction scripts. A changed result requires an explanation and review of the affected fixtures or algorithms.
