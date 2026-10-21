# Future Development

## Important

Here are some of the envisioned changes, in approximate order of importance (from the more important to less important):

- Verify the completion-review hook reliably and consistently cycles through expected number of review cycles - e.g. validate on the real Copilot session history
- See if we need to better insist on review /tests being comprehensive - perhaps as part of independent review instructions?
    - Sometimes the context of what the user asked for is getting lost after long conversation with multiple compactifications and perhaps some messages considered as user input. It may be worth it to contextualize user request well at the time of user message submission (e.g. as part of a separate task run perhaps by a weaker LLM) - and then use it in the context reminder as part of the stop hook.
- Help the agent understand which changes are worth doing vs. postpoing - i.e. based on the scope of the original request.
- Review in which scenarios to suggest/demand/trigger subagent review to balance focus & quality
    - Currently we suggest an agent trigger subagent review if it cannot find significany plausible gaps, but this may not be totally reliable - consider triggering the review automatically as part of the stop hook; however, this needs to be done carefully so as to include the right scope into this review task.
    - Also, the process asks the agent to brief a subagent itself; the brief may be author-biased ("verify everything is solid"). Consider generating the brief from the hook (user request verbatim + invariants) as part of the existing "review automatically from the stop hook" idea above.
- Add a hook to re-try once in response to header timeout error - this can help if the LLM server spends time on some work that will not be repeated

## Low Priority

- Consider adding state file cleanup mechanism to remove stale state files (hooks use JSON state files keyed by session hash — stale files from old sessions accumulate over time)
- Consider adding a separate, non-critical logging mechanism (outside try-catch blocks) for debugging hook state changes

## AI-suggested additions (to be reviewed)

Agents - please add AI-suggested action items here.

