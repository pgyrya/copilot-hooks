# Verify completion

We'd like a `Stop` hook that blocks agent completion a fixed number of times per agent turn. Each time it:

- brings the agent's attention to the [best practices](../../copilot-instructions.md), and
- adds the configurable [review instructions](completion-review-prompt.md) — one section per cycle (`## Cycle N` … `## Final cycle`; a prompt without such headings is used for every cycle).

## Design

- A turn starts at the first `Stop` whose `stop_hook_active` is `false` (the harness is not continuing because of a previous block). Each further `Stop` with `stop_hook_active: true` advances the cycle; after N blocks the hook allows.
- `UserPromptSubmit` is **not** used. VS Code also fires it for subagent prompts in the same session, so it cannot tell a user message from the review's own subagent. Counting on it made the review restart after the last cycle (`1/2 → 2/2 → 1/2 → …`); see the CHANGELOG entry for the evidence.
- If `stop_hook_active` is not a boolean (unknown harness), the hook never blocks and says so, rather than risk blocking forever.
- Configuration: `DEFAULT_REVIEW_CYCLES` in [verify-completion.cjs](verify-completion.cjs), overridable with the `COMPLETION_REVIEW_CYCLES` environment variable.

## Testing

The invariants and the test that fails if each one is broken are listed at the top of [verify-completion.test.cjs](verify-completion.test.cjs). The most important test replays the event sequence recorded in the VS Code hooks log.

Run: `node --test verify-completion.test.cjs`

When the hook misbehaves in a real session, read the VS Code output channel **GitHub Copilot Chat Hooks** (files named `GitHub Copilot Chat Hooks.log` under `~/.vscode-server/data/logs/*/exthost*/GitHub.copilot-chat/`) — it records the exact input and output of every hook call — and add the offending sequence as a test.

### Live check

1. In a Copilot session, finish a small task and try to stop.
2. Expect blocks `CYCLE 1/N` … `CYCLE N/N`, even if the review launches subagents.
3. The next stop attempt must be allowed. If the cycle numbers restart, there is a bug — capture the hooks log.

## Known limitations / not covered

- No file locking on the state file (one Copilot process per session is assumed).
- A missing or empty `completion-review-prompt.md` is not tested (the prompt path is fixed next to the script).
- Behaviour in harnesses other than VS Code is untested; they must provide `stop_hook_active`.
