# Future Development

## Important

- Loops of more than 1 message still happen - suggest to treat them as part of the detect-repeating-message hook
- Currently we ask an agent to outsource the review to a subagent, but this may not be totally reliable - consider triggering the review automatically as part of the stop hook; however, this needs to be done carefully so as to include the right scope into this review task.
- Find a way to better insist on tests being comprehensive - perhaps as part of independent review instructions
- Help the agent understand which changes are worth doing vs. postpoing - i.e. based on the scope of the original request.

- Verify the new completion-review hook in a live VS Code session (see "Live check" in [user-story](hooks/completion-review/user-story.md)) and confirm `stop_hook_active` behaves as in the recorded logs when a user message arrives mid-review.
- The review still asks the agent to brief a subagent itself; the brief has been author-biased ("verify everything is solid"). Consider generating the brief from the hook (user request verbatim + invariants) as part of the existing "review automatically from the stop hook" idea above.

## Low Priority

- test and repair edge cases when detecting repeating messages
- Consider adding state file cleanup mechanism to remove stale state files (hooks use JSON state files keyed by session hash — stale files from old sessions accumulate over time)
- Consider adding a separate, non-critical logging mechanism (outside try-catch blocks) for debugging hook state changes
