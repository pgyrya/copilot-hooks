# Verify completion

We'd like to implement a stop hook, which block agent completion a fixed number of times, each time:

- brings the agents' attention to the same [copilot instructions](../copilot-instructions.md), and
- provide configurable [general instructions](completion-review-prompt.md) around how to structure this review session

## Testing Narrative

### What is being tested

**Cycle lifecycle** — 10 tests verify the core state machine:
- `UserPromptSubmit` initializes cycle to 0
- `Stop` increments cycles 1 through configured max sequentially
- Same prompt during an active cycle does not reset the counter
- Cycle beyond max is allowed (boundary: cycle reaches REVIEW_CYCLES_PER_USER_MESSAGE, next Stop returns continue: true)
- Different prompt resets cycle to 0
- `UserPromptSubmit` with a different prompt after max cycles completes resets to cycle 1
- Prompt A completes max cycles → Prompt B starts at cycle 1 (full transition test)
- Different prompt preserves incomplete cycle (cycle goes 0 → 1 → 2 → 3 instead of oscillating 0 → 1 → 0 → 1)
- Different prompt updates prompt_hash so that switching back to the original prompt starts a fresh cycle
- Different prompt updates prompt_hash in state file (verifies intermediate state after else if branch)

**State resilience** — 3 tests verify recovery from corrupted state:
- Invalid JSON in state file triggers reset to cycle 0
- Out-of-range cycle value (e.g., -1 or 99) triggers reset
- Concurrent sessions with different session_ids maintain independent state files

**Regression prevention** — 2 tests cover the original double-block bug:
- Different prompt between two Stop events resets cycle (prevents double-block at cycle 1)
- Same prompt after different prompt starts new cycle (prompt A → prompt B → prompt A)

**Exact double-block reproduction** — 1 test:
- Same prompt, three consecutive Stop events in same session: first blocks at cycle 1/3, second at 2/3, third allows at 3/3

**Null/missing field handling** — 3 tests verify graceful handling of missing fields:
- `UserPromptSubmit` without a `prompt` field sets `promptHash` to null
- `Stop` event without a `prompt` field increments cycle
- Null `promptHash` in state vs valid `promptHash` in event preserves incomplete cycle (cycle 1 → 2, blocks; cycle 2 → 3, allows)

**Configuration validation** — 1 test verifies the hook config is well-formed:
- `verify-completion.json` contains valid hook registration for both `UserPromptSubmit` and `Stop` events

**Graceful degradation** — 5 tests cover file-missing scenarios:
- Missing `copilot-instructions.md` → returns `continue: true` with system message
- Empty `copilot-instructions.md` → returns `continue: true` with system message
- Missing `completion-review-prompt.md` → returns `continue: true` with system message
- Empty `completion-review-prompt.md` → returns `continue: true` with system message
- These paths are simple conditionals that cannot crash the hook

**Session isolation** — 4 tests verify session behavior:
- `UserPromptSubmit` ignores different sessions (doesn't touch state file)
- Stop handler resets state on session mismatch (cycle → 0, then increments to 1)
- Session B Stop does not corrupt Session A state (cross-session preservation)
- Concurrent sessions maintain independent state

**Fallback behavior** — 1 test:
- `VSCODE_AGENT_SESSION_ID` env var fallback when `event.session_id` is missing

**Total: 26 tests**

### Why this is sufficient

The 26 tests cover the **complete state machine** (init → increment → boundary → reset → transition) and **state corruption recovery**, which are the only two behaviors that affect correctness. The 9 cycle tests exercise every branch of the `Stop` handler's cycle comparison logic (`< configured max`, `== configured max`, `> configured max`) and verify the full transition from one prompt completing to another starting fresh. The reset tests verify both prompt-matching and prompt-differing paths in `UserPromptSubmit`, including the critical fix where different prompts update `prompt_hash` to enable proper cycle tracking when switching between prompts. One test explicitly verifies the intermediate state file contents after the `else if` branch executes, making future debugging easier. The corrupted state tests ensure the hook self-heals rather than getting stuck. The exact double-block reproduction test validates the original bug fix. The cross-session preservation test ensures Session B's Stop cannot corrupt Session A's state. All tests run the hook as a subprocess via `spawnSync`, exercising the actual execution path rather than importing the module.

The untested graceful-degradation paths (missing files) are low-risk because they are single `fs.existsSync` checks that return a fixed value — there is no state mutation or branching logic that could introduce subtle bugs.

**Note on asymmetry**: `UserPromptSubmit` ignores different sessions (returns early without touching state), while `Stop` resets state on session mismatch. This is intentional — `Stop` needs to own the state file for its session, while `UserPromptSubmit` should not affect other sessions' state.

### Live session testing

To verify the hook works in an actual Copilot session, the agentic harness (Copilot) should perform a manual check:

1. **Write a task and call it done**: Start implementing a small feature and call the task complete.
2. **Observe the hook blocking**: Expect the hook to block with a review prompt (e.g. cycle 1/N where N is the configured REVIEW_CYCLES_PER_USER_MESSAGE value).
3. **Continue working**: After completing the review, call the task done again with a slightly different message.
4. **Repeat until the final cycle**: Continue this pattern until you reach the final cycle, with each iteration using a slightly different message.
5. **Final completion**: Only when you believe the work is truly done, call the task complete — expect NOT to get back control (the stop is allowed).
6. **Bug detection**: If control returns with a hook warning message after the final cycle, there is a bug.

This manual test validates the complete lifecycle: block → .. → block → allow, ensuring the hook correctly enforces review cycles before allowing agent completion.
