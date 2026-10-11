# Verify completion

We'd like a `Stop` hook that blocks agent completion a fixed number of times per agent turn. Each time it:

- injects dynamic references from instruction files (e.g., `{reference:../../copilot-instructions.md:Best Practices}`), and
- adds the configurable [review instructions](completion-review-prompt.md) — one section per cycle (`## Cycle N` … `## Final cycle`; a prompt without such headings is used for every cycle).

## Design

- A turn starts at the first `Stop` whose `stop_hook_active` is `false` (the harness is not continuing because of a previous block). Each further `Stop` with `stop_hook_active: true` advances the cycle; after N blocks the hook allows.
- `UserPromptSubmit` is **not** used. VS Code also fires it for subagent prompts in the same session, so it cannot tell a user message from the review's own subagent. Counting on it made the review restart after the last cycle (`1/2 → 2/2 → 1/2 → …`); see the [CHANGELOG](CHANGELOG.md) entry for the evidence.
- If `stop_hook_active` is not a boolean (unknown harness), the hook never blocks and says so, rather than risk blocking forever.
- Configuration: review cycle count is inferred from the number of `## Cycle N` / `## Final cycle` headings in [completion-review-prompt.md](completion-review-prompt.md). No environment variable needed.
- Dynamic references: the prompt file can include `{reference:file:section}` placeholders that are resolved at runtime. Missing files or sections produce a visible warning in the prompt rather than a silent skip.
- The `selectSection()` function prepends the prompt's intro text (everything before the first `## ` heading) to every cycle's output. This means the intro appears N times in an N-cycle review.

## Reference Syntax

```
{reference:relative/path/to/file.md:Section Name}
```

- `file` — relative path from the prompt file's directory (e.g., `../../copilot-instructions.md`)
- `section` — a level-2 heading text (without the `## ` prefix), e.g., `Best Practices`
- The resolver extracts content from `## Section Name` to the next `## ` heading or end of file
- Missing files or sections produce `[Reference not found: file:section]` in the output
- References are resolved on every cycle, not just the final one

### Examples

```
{reference:../../copilot-instructions.md:Best Practices}
{reference:AGENTS.md:How to minimize maintenance}
```

## Prompt Structure

The current [prompt](completion-review-prompt.md) has 3 sections:

| Section | Purpose |
|---------|---------|
| `## Cycle 1: Revisit the goals` | Step back, restate intent, review practices, prioritize |
| `## Cycle 2: Verify the key expectations are addressed` | Define invariants, identify blind spots, verify with evidence |
| `## Final cycle: Document, Polish, Follow-up, Respond` | Verify completion, record bugs, review best practices, give final answer |

The intro text (lines 1–4, before the first `## ` heading) is prepended to every cycle's output.

## Testing

The invariants and the test that fails if each one is broken are listed at the top of [verify-completion.test.cjs](verify-completion.test.cjs). The most important test replays the event sequence recorded in the VS Code hooks log.

**Generic tests:** The test suite reads the shipped prompt at module level (`const MAX = countCycles(SHIPPED_PROMPT)`) and derives expected outcomes dynamically via `expectedOutcomes(activeFlags, max)`. Changing the number of cycles in `completion-review-prompt.md` does not require test updates.

Run: `node --test verify-completion.test.cjs`

When the hook misbehaves in a real session, read the VS Code output channel **GitHub Copilot Chat Hooks** (files named `GitHub Copilot Chat Hooks.log` under `~/.vscode-server/data/logs/*/exthost*/GitHub.copilot-chat/`) — it records the exact input and output of every hook call — and add the offending sequence as a test.

### Live check

1. In a Copilot session, finish a small task and try to stop.
2. Expect blocks `CYCLE 1/3` … `CYCLE 3/3`, even if the review launches subagents.
3. The next stop attempt must be allowed. If the cycle numbers restart, there is a bug — capture the hooks log.

## Exports

The module exports the following functions for testing:

- `decide(previousCycle, event, max)` — Pure state machine: returns `{ cycle, action }` where action is `'block'`, `'allow'`, or `'unknown'`
- `selectSection(prompt, cycle, max)` — Selects the `## Cycle N` / `## Final cycle` section from the prompt
- `countCycles(prompt)` — Counts `## Cycle \d+` and `## Final cycle` headings
- `extractSection(content, sectionName)` — Extracts content from a markdown file by level-2 heading
- `resolveReferences(text)` — Resolves `{reference:file:section}` placeholders
- `buildPrompt(prompt, cycle, max)` — Builds the full review prompt for a given cycle
- `handleStop(event, { stateFile, prompt })` — Main entry point called by the VS Code hook

## Known limitations / not covered

- No file locking on the state file (one Copilot process per session is assumed).
- A missing or empty `completion-review-prompt.md` is not tested (the prompt path is fixed next to the script).
- Behaviour in harnesses other than VS Code is untested; they must provide `stop_hook_active`.
- State files persist indefinitely in `~/.copilot/hooks/.state/` — no TTL or cleanup mechanism.
- The intro text is duplicated on every cycle (see `selectSection()` in [verify-completion.cjs](verify-completion.cjs)).
