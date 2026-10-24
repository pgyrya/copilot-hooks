# Change Log

Please only keep a high-level note on the most relevant changes in this log, organized by dat - more recent on top.

## Changes

### 2026-10-24 — Fix completion-review Markdown references
- Fixed section extraction ending at the first line break instead of the next level-two heading or end of file; added regression coverage for multiline sections and the complete `Guidelines` reference.

### 2026-10-13 — Detect repeated tool-call cycles
- Added PreToolUse detection for repeated tool signatures using tool name and canonicalized arguments, independent of assistant reasoning text and turn boundaries; handles standalone JSON tool events and includes regression coverage for identical calls and repeated multi-call cycles.
