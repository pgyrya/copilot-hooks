# Copilot Hooks

VS Code Copilot hooks that run during the coding session to enforce general practices.

## Feature Folders

The hooks are organized by feature for easier navigation. Each feature folder contains:

- `user-story.md` — User story and testing narrative (entry point)
- `*.cjs` — Hook implementation
- `*.test.cjs` — Test file (named to match the hook)
- `*.md` — Configurable prompts or instructions

Hook configuration JSON files live at the **hooks root** (not in subfolders) because VS Code only reads from the root directory.

### Example 

Let's consider [completion-review](completion-review/) as an example of a useful feature hook.

Here is how the folder is organized:

- [verify-completion.cjs](completion-review/verify-completion.cjs) — Manages review cycles for general practices. Blocks Stop events until N review cycles are completed per user message (see top of the file for configuration).
- [User Story](completion-review/user-story.md)
- [Tests](completion-review/verify-completion.test.cjs)

## State

Hook state is stored in `.state/` directory, keyed by session hash. State files are named `completion-{sessionKey}.json`.

## Testing

Run tests from a feature folder, for example:

```bash
cd completion-review && node --test verify-completion.test.cjs
```

## Related Documentation

- [General Guidelines](../copilot-instructions.md) — Practices enforced by the hooks
- [TODO](../TODO.md) — Improvement opportunities (hooks-specific items logged here by convention)
