# Fallow local-only policy

This frontend uses the free local/static Fallow layer only.

Allowed:

- `npm run fallow`
- `npm run fallow:json`
- `npm run fallow:dead-code`
- `npm run fallow:dupes`
- `npm run fallow:health`
- `npm run fallow:audit`
- `npm run fallow:fix:dry`
- local Istanbul coverage input via `fallow health --coverage <coverage-final.json>` if needed

Not allowed in this repo setup:

- `fallow license ...`
- `fallow coverage setup`
- `fallow coverage upload-inventory`
- `fallow health --runtime-coverage ...`
- Fallow Cloud API keys or runtime ingestion

Rationale:

The free static layer is enough for local and agent-assisted development: dead code, unused exports/files/dependencies, duplication, complexity/health, architecture boundaries, static feature flag detection, JSON output, MCP, editor/LSP, and CI. The paid/cloud runtime layer is intentionally not enabled here.
