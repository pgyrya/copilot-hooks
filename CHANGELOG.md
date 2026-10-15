# Change Log

Please only keep a high-level note on the most relevant changes in this log, organized by dat - more recent on top.

## Changes

### 2026-10-13 — Detect repeated tool-call cycles
- Added PreToolUse detection for repeated tool signatures using tool name and canonicalized arguments, independent of assistant reasoning text and turn boundaries; handles standalone JSON tool events and includes regression coverage for identical calls and repeated multi-call cycles.
