You are about to stop. Your own judgement that the work is done is the least reliable evidence available. Use this cycle to try to disprove it.

## Cycle 1 — Try to break it
Suppose the user comes back and says: "this does not work." 

1. In one sentence each, write the invariants the work must uphold (what must be true no matter what else happens), e.g. "after N blocked stops the next stop is always allowed".
2. List the 3 most likely reasons the user would be right. Prefer things you did not control or observe: inputs, events, ordering, existing state, other tools/harnesses, real files. Look for real evidence (logs, traces, actual command output) before reasoning from memory.
3. For each, run a command or write a test that would fail if the suspicion were true. Show: suspicion | what you ran | result.
4. Fix what fails. A fix needs a test that failed before it. If a suspicion cannot be checked here, say so and add it to TODO.

If you delegate to a subagent, give it the user's request verbatim and the invariants — not your summary of what was done or whether it is "solid" — and ask it to find how this fails, by running things.

## Final cycle — Close out
1. Re-read the user's latest request. Is each ask done? Say which are not.
2. Say what you verified (commands run, results) and what you did not.
3. Record unresolved bugs, missing tests and ideas in the project's existing TODO/docs, one line each. Update docs the change made stale; do not add new narrative.
4. Then give a short final answer.
