# Verify completion

We'd like to implement a stop hook, which block agent completion a fixed number of times, each time:

- brings the agents' attention to the [best practices](../copilot-instructions.md), and
- provide configurable [review instructions](completion-review-prompt.md) around how to structure this review session (detecting issues, planning follow-ups, and longer-term improvements)

## Testing Narrative

### What is being tested

**REVIEW_CYCLES_PER_USER_MESSAGE = 1 edge case** — 2 tests verify behavior with minimum cycle count:
- `maxCycles=1` creates block → allow → allow → reset → block pattern (cycle reaches max, subsequent Stops allow until UserPromptSubmit resets)
- `UserPromptSubmit` resets cycle to 0 when previous cycle >= maxCycles (verifies the reset mechanism with minCycles)

**Cycle lifecycle** — 13 tests verify the core state machine:
- `UserPromptSubmit` initializes cycle to 0
- `Stop` increments cycles 1 through configured max sequentially
- Same prompt during an active cycle does not reset the counter
- Boundary: Stop after max cycles returns continue without hookSpecificOutput
- Different prompt preserves incomplete cycle, next Stop increments
- Different prompt updates prompt_hash so that switching back to the original prompt starts a fresh cycle
- Different prompt updates prompt_hash in state file (verifies intermediate state after else if branch)
- Prompt A completes max cycles → Prompt B starts at cycle 1 (full transition test)
- Recovers from corrupted session state (invalid JSON)
- Recovers from out-of-range cycle value (Number.MAX_SAFE_INTEGER)
- Recovers from negative cycle value (-1)
- Recovers from non-integer cycle value (1.5)
- Recovers from missing cycle field
- Stop event without prompt field increments cycle and preserves prompt_hash

**Edge cases** — 12 tests verify edge cases and graceful degradation:
- `UserPromptSubmit` without a `prompt` field sets `promptHash` to null
- Missing `copilot-instructions.md` → returns `continue: true` with systemMessage
- Empty `copilot-instructions.md` → returns `continue: true` with systemMessage
- Missing `completion-review-prompt.md` → returns `continue: true` with systemMessage
- Empty `completion-review-prompt.md` → returns `continue: true` with systemMessage
- **Both files missing** → returns `continue: true` with systemMessage (new test from fourth review round)
- Different session does not affect existing state (two independent state files)
- Isolated sessions maintain independent state
- Malformed JSON input returns `continue: true` with error message
- Stop event without prior UserPromptSubmit initializes cycle to 1 (cold start)
- Consecutive UserPromptSubmit events update prompt_hash without incrementing cycle
- Empty string prompt creates distinct prompt_hash from missing prompt field

**Bug regression tests** — 5 tests cover regression scenarios:
- `stateWarning` included in block response when handleStop detects invalid state (validates invalid state path)
- Different prompt preserves incomplete cycle through multiple stops and exhaustion (prevents double-block at cycle 1)
- Different prompt preserves cycle through exhaustion, re-submitting original prompt resets (prompt A → prompt B → prompt A)
- Session B Stop does not corrupt Session A state (cross-session preservation)
- Stop event without prompt field increments cycle and preserves prompt_hash (original double-block bug — Stop without prompt field)

**Hook configuration** — 1 test verifies the hook config is well-formed:
- `verify-completion.json` contains valid hook registration for both `UserPromptSubmit` and `Stop` events

**Event routing edge cases** — 4 tests verify fallback and passthrough behavior:
- `VSCODE_AGENT_SESSION_ID` env var fallback when `event.session_id` is missing
- Stop handler resets state on session mismatch (cycle → 0, then increments to 1)
- Null `promptHash` in state vs valid `promptHash` in event preserves incomplete cycle
- Unknown hook event passes through with continue: true and no systemMessage

**State structure validation** — 5 tests verify state file structure:
- `UserPromptSubmit` writes state with `updated_at` field (ISO timestamp string)
- `Stop` preserves `updated_at` field when incrementing cycle
- `UserPromptSubmit` writes state with `prompt_submitted_at` field (ISO timestamp string)
- **Stop preserves `prompt_submitted_at`** when incrementing cycle (new test from fourth review round — verifies the field is NOT updated by Stop events)

**Test organization**: Tests are organized into 7 `describe()` blocks for better test runner output:
- `Cycle lifecycle` (13 tests), `Edge cases` (12 tests), `Bug regression tests` (5 tests),
  `Hook configuration` (1 test), `Event routing edge cases` (4 tests),
  `State structure validation` (5 tests), `REVIEW_CYCLES_PER_USER_MESSAGE = 1 edge case` (2 tests)

**Total: 41 tests**

### Why this is sufficient

The 41 tests cover the **complete state machine** (init → increment → boundary → reset → transition) and **state corruption recovery**, which are the only two behaviors that affect correctness. The 9 cycle tests exercise every branch of the `Stop` handler's cycle comparison logic (`< configured max`, `== configured max`, `> configured max`) and verify the full transition from one prompt completing to another starting fresh. The reset tests verify both prompt-matching and prompt-differing paths in `UserPromptSubmit`, including the critical fix where different prompts update `prompt_hash` to enable proper cycle tracking when switching between prompts. One test explicitly verifies the intermediate state file contents after the `else if` branch executes, making future debugging easier. The corrupted state tests ensure the hook self-heals rather than getting stuck. The cross-session preservation test ensures Session B's Stop cannot corrupt Session A's state. The `stateWarning` test validates the invalid state detection path in `handleStop`. All tests run the hook as a subprocess via `spawnSync`, exercising the actual execution path rather than importing the module. Four additional tests verify state file structure: `updated_at` and `prompt_submitted_at` fields are present after both `UserPromptSubmit` and `Stop` events. Test names accurately reflect their key assertions, and duplicate test names across describe blocks have been eliminated for clarity. Three tests cover previously untested paths: cold start (Stop without prior UserPromptSubmit), consecutive UserPromptSubmit events (prompt switching without Stop), and empty string prompt vs. missing prompt field distinction. Two additional tests from the fourth review round verify: (1) both files missing scenario (graceful degradation when neither copilot-instructions.md nor completion-review-prompt.md exist), and (2) Stop event preserves prompt_submitted_at field (verifies the field is NOT updated by Stop events, only by UserPromptSubmit).

**Config-aware tests**: All cycle tests dynamically read `REVIEW_CYCLES_PER_USER_MESSAGE` from the source code via regex, so they automatically adapt to any configuration change. This is intentional — hardcoding cycle values would make tests fragile and require updates whenever the config changes.

**Asymmetric return pattern**: The hook uses an asymmetric return pattern — when a completion is allowed, the response contains `{ continue: true }` with NO `hookSpecificOutput` field. When blocked, it includes `hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason: '...' }`. Tests check for the ABSENCE of `hookSpecificOutput` to verify the allow path, which is the core contract of the hook system.

**StateWarning pattern**: The `stateWarning` variable is set when invalid state is detected and reset, then included in the return response via spread operator. This provides visibility into state resets without affecting the core decision logic.

The untested graceful-degradation paths (missing files) are low-risk because they are single `fs.existsSync` checks that return a fixed value — there is no state mutation or branching logic that could introduce subtle bugs.

**Note on asymmetry**: `UserPromptSubmit` ignores different sessions (returns early without touching state), while `Stop` resets state on session mismatch. This is intentional — `Stop` needs to own the state file for its session, while `UserPromptSubmit` should not affect other sessions' state.

### Live session testing

To verify the hook works in an actual Copilot session, the agentic harness (Copilot) should perform a manual check:

1. **Write a task and call it done**: Start implementing a small feature and call the task complete.
2. **Observe the hook blocking**: Expect the hook to block with a review prompt (e.g. cycle 1/5 where 5 is the configured REVIEW_CYCLES_PER_USER_MESSAGE value).
3. **Continue working**: After completing the review, call the task done again with a slightly different message.
4. **Repeat until the final cycle**: Continue this pattern until you reach the final cycle (e.g. cycle 5/5), with each iteration using a slightly different message.
5. **Final completion**: Only when you believe the work is truly done, call the task complete — expect to get back control (the stop is allowed when cycle exceeds maxCycles, i.e., cycle 6+ when maxCycles is 5).
6. **Bug detection**: If control returns with a hook warning message after the final cycle, there is a bug.

This manual test validates the complete lifecycle: block → .. → block → allow, ensuring the hook correctly enforces review cycles before allowing agent completion.

### Known Limitations

**No file locking**: The implementation has no file locking mechanism. If two processes somehow write to the same state file simultaneously, data could be corrupted. The `writeState` function does a full overwrite. This is unlikely in practice since Copilot runs as a single process, but it's a design risk worth noting.

**Prompt hash collision**: The implementation uses `prompt_hash` (SHA256) to detect prompt changes. If two different prompts happen to produce the same hash (extremely unlikely with SHA256, but theoretically possible), the cycle would not reset. This is a design-level concern, not a testable scenario.

**Test suite label**: The test suite should be labeled as an "integration test suite" since it runs the hook as a subprocess via `spawnSync`, exercising the actual execution path rather than importing the module. This distinction matters for CI/CD pipeline configuration.

**Malformed JSON test**: One test bypasses the `runHook` helper and manually spawns the subprocess to test malformed JSON handling. This is intentional (the helper would fail before assertions), but it means the test doesn't exercise the helper's error handling. This is a low-priority gap since the helper itself is trivial.

**No concurrent access test**: The test suite does not include a concurrent access test (two processes writing to the same state file simultaneously). This is low risk given the sequential execution model, but could be added if the implementation ever supports parallel execution.

**Test performance**: The test suite takes ~5 seconds to run 41 tests, which is inherent to the design (each test spawns a subprocess). This is acceptable for pre-commit/CI validation but not suitable for rapid iteration. No action needed — this is a known trade-off.

**No handleUserPromptSubmit invalid-state test**: The `handleStop` handler has an explicit invalid-state path tested via the `stateWarning` test, but `handleUserPromptSubmit` has a similar `isValidState` check that is not directly tested. The validation logic is shared (same `isValidState` function), so testing one handler provides reasonable coverage. This is a low-priority gap.

**REVIEW_CYCLES_PER_USER_MESSAGE hardcoded**: The value `5` is hardcoded in verify-completion.cjs line 35, not configurable via a config file. This is a design limitation — the hook reads the value from its own source code via regex in config-aware tests. Adding a config file mechanism would be a future enhancement.

**Test file modularization**: The test file is 2000+ lines with minimal modularization. Significant code duplication exists across the Bug regression tests (three nearly identical test blocks with while-loop exhaustion patterns). This is a maintenance burden but not a correctness issue. Refactoring into shared helpers would reduce duplication.

**Missing test: handleStop at exact REVIEW_CYCLES_PER_USER_MESSAGE boundary**: No test explicitly verifies the behavior when `state.cycle === REVIEW_CYCLES_PER_USER_MESSAGE` (i.e., cycle equals exactly 5). The boundary tests use dynamic cycle values based on the configured maxCycles, but an explicit test at the exact boundary value would provide additional confidence.

**Missing test: handleStop writeState error handling**: No test simulates `writeState` failure (disk full, permission denied). The error handling path in `handleStop` writes state and catches errors, but this path is not exercised by tests.

**Missing test: handleUserPromptSubmit with null prompt_hash and valid event prompt**: No test explicitly verifies the behavior when the state has `prompt_hash: null` but the UserPromptSubmit event includes a valid prompt. The null promptHash regression test covers a different scenario (preserving incomplete cycle).
