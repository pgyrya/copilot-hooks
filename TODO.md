# Future Development

## Important

- Currently we ask an agent to outsource the review to a subagent, but this seems not totally reliable - consider triggering the review automatically as part of the stop hook; however, this needs to be done carefully so as to include the right scope into this review task.
- Find a way to better insist on tests being comprehensive - perhaps as part of independent review instructions
- Help the agent understand which changes are worth doing vs. postpoing - i.e. based on the scope of the original request.

## Low Priority

- test and repair edge cases when detecting repeating messages
- Consider adding state file cleanup mechanism to remove stale state files (hooks use JSON state files keyed by session hash — stale files from old sessions accumulate over time)
- Consider adding a separate, non-critical logging mechanism (outside try-catch blocks) for debugging hook state changes
- Add test to validate that config command paths resolve to existing files (currently only checks config structure)

## Recent Sessions

### Completion Review Hook — Cycle Threshold Change (Current Session)
- **Request**: Increase `REVIEW_CYCLES_PER_USER_MESSAGE` from 2 to 3 so the agent gets 2 complete review cycles before being allowed to stop
- **Rationale**: With value 2, the agent was only blocked once (cycle 1) before being allowed at cycle 2. With value 3, the agent is blocked at cycles 1 and 2, then allowed at cycle 3 — giving 2 complete review cycles.
- **Code Change**: Changed `REVIEW_CYCLES_PER_USER_MESSAGE` from 2 to 3 in `verify-completion.cjs` line 6
- **Test Updates**: Updated 5 test assertions to reflect new threshold:
  - Test 6: `maxCycles > 2 ? 'block' : 'allow'` (cycle 2 blocks when maxCycles=3)
  - Test 19: Added Step 5 (Stop → cycle 3, allow) for double-block regression fix
  - Test 20: Added Step 5 (Stop → cycle 3, allow) for same-prompt regression test
  - Test 24: Added second Stop assertion (cycle 2 blocks, cycle 3 allows)
  - Test 25: Changed from 2 Stops to 3 Stops (block at 1/3, block at 2/3, allow at 3/3)
- **Documentation**: Updated `user-story.md` to reflect 3-cycle threshold
- **Total Tests**: 26/26 completion-review passing, 16/16 detect-repeated-message passing

### Completion Review Hook — Narrative Migration & Cleanup (Previous Session)
- **Task 1**: Moved testing narrative from `verify-completion.test.cjs` code comments to `user-story.md` in Markdown format (easier to read)
- **Task 2**: Deleted `final-status.md` from `detect-repeated-message` folder (doesn't belong there)
- **Task 3**: Added test 25 — "Session B Stop does not corrupt Session A state" (cross-session preservation regression test)
- **Subagent Review**: Launched review which confirmed all tasks completed correctly; identified TODO.md logging gap (addressed here)
- **Total Tests at Time**: 25/25 completion-review passing, 16/16 detect-repeated-message passing

### Completion Review Hook — Prompt Hash Fix (Previous Session)
- **Bug Discovered**: When a different prompt was submitted with an incomplete cycle, the code preserved the cycle but did NOT update `prompt_hash`. This caused issues when the original prompt was re-submitted later — it matched the old hash and was seen as the same prompt.
- **Root Cause**: Missing else branch in UserPromptSubmit handler to update `prompt_hash` when preserving an incomplete cycle for a different prompt.
- **Solution**: Added else branch to update `prompt_hash` to the new prompt's hash while preserving the cycle count. This ensures that when the user switches back to the original prompt (after the other prompt completed), it's recognized as a NEW prompt and cycle resets to 0.
- **Code Change**: Added `else if (isNewPrompt && previousState && previousState.cycle < REVIEW_CYCLES_PER_USER_MESSAGE)` branch in `verify-completion.cjs` lines ~95-101.
- **Tests at Time**: 26 tests pass, including:
  - Test 18: Different prompt preserves incomplete cycle
  - Test 19: Different prompt preserves cycle, same prompt after completes resets
  - Test 23: Null promptHash preserves incomplete cycle
  - Test 7 (new): Different prompt updates prompt_hash in state file (verifies intermediate state)
- **Documentation**: Updated `user-story.md` to reflect new behavior around prompt_hash updates and added state file assertion test.
- **Subagent Review**: Launched review which confirmed all tasks completed correctly; identified two minor gaps:
  1. `prompt_submitted_at` field is stored but never read — left as-is for potential future use (stale-cycle detection)
  2. Missing state file assertion test — addressed by adding test 7

### Completion Review Hook — Double-Block Fix (Previous Session)
- **Bug Fixed**: Cycle 1/2 double-block when user submitted same prompt twice in consecutive `task_complete` attempts
- **Root Cause**: Complex conditional logic in `UserPromptSubmit` handler failed to reset cycle for new prompts in same session
- **Solution**: User's simpler design — same session new prompt resets cycle, same session same prompt preserves cycle, different session ignores
- **Tests Added**: 3 new edge case tests (VSCODE_AGENT_SESSION_ID fallback, Stop handler session mismatch, null promptHash comparison)
- **Total Tests at Time**: 23 passing

### Completion Review Hook — General Practice Review (Previous Session)
- **Testing Narrative**: Added comprehensive narrative to test file explaining why 24 tests are sufficient (AGENTS.md requirement)
- **Double-Block Reproduction Test**: Added exact reproduction test (test 24) that simulates the user's original bug scenario
- **Asymmetry Comment**: Added comment in `verify-completion.cjs` explaining why UserPromptSubmit ignores different sessions while Stop resets them
- **Bug Fix**: Replaced `promptHash` reference in Stop handler with `null` (promptHash is only defined in UserPromptSubmit branch)
- **Total Tests at Time**: 24 passing
