# Future Development

## Important

- Loops of more than 1 message still happen - suggest to treat them as part of the detect-repeating-message hook
- Currently we ask an agent to outsource the review to a subagent, but this may not be totally reliable - consider triggering the review automatically as part of the stop hook; however, this needs to be done carefully so as to include the right scope into this review task.
- Find a way to better insist on tests being comprehensive - perhaps as part of independent review instructions
- Help the agent understand which changes are worth doing vs. postpoing - i.e. based on the scope of the original request.

## Low Priority

- test and repair edge cases when detecting repeating messages
- Consider adding state file cleanup mechanism to remove stale state files (hooks use JSON state files keyed by session hash — stale files from old sessions accumulate over time)
- Consider adding a separate, non-critical logging mechanism (outside try-catch blocks) for debugging hook state changes
- Add a test that parses each hook-root JSON config and verifies its command points to an existing hook script. Current configuration tests check registration/structure but do not catch a typo or stale script path, which would otherwise only surface when VS Code tries to run the hook. Keep the test portable across user home directories.
