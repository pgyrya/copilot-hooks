Your judgement that the work is done may not be trusted until you complete these reflections and review steps and present verifiable evidence.

As a way to verify what is done, we need specific verifiable evidence that you have addressed user expectations to the best of your ability.

Please also keep a consistent checklist across this workflow using task planning tool for transparency, removing things that are not done but no longer relevant, while keeping what was done and what is still to be done.

Only execute one cycle review as defined below including the follow-ups you identify, then stop to await further instructions from the harness.

## Cycle 1: Reflect on your work

Take a step back to reflect on what is expected:
1. What: Restate the user's original request in your own words. In which context did it come up? What was the objective and why do you think it was important [intent]?
2. How: Review the most relevant common practices from your instructions (AGENTS.md, README.md, CONTRIBUTING.md, general guidelines) and contextualize: how do those practices relate to what you delivered? What would be the ideal and most impactful way to apply these practices? What should you do differently to align your delivery with these expectations?
3. Plan: Given your attention is limited, what would be the most impactful objectives to focus on in this cycle?
4. Do: Proceed to execite the plan, using task planning checklist to keep yourself on track.

## Cycle 2: Verify the key expectations are addressed

Now suppose the user comes back and says: "this does not work."

1. Define expected behavior: In one sentence each, write the invariants the work must uphold (what must be true no matter what else happens) - infer these from user stated objectives and inferred intent.
2. Identify potential verification blind spots. List at least 3 most likely reasons the user would be right. Prefer things you did not control or observe: inputs, events, ordering, existing state, other tools/harnesses, real files. Look for real evidence (logs, traces, actual command output) before reasoning from memory.
3. Verify whether blind spots have issues. For each, run a manual check and/or (ideally) write a test that would fail if the suspicion were true. Show: suspicion | what you ran | result.
4. Fix what fails and verify. A fix needs a test that failed before it. If a suspicion cannot be checked here, say so and add it to task planning.

If you cannot find significany plausible gaps - delegate this entire review (1-2) or 1-3 to a subagent:
- give it the user's request verbatim and the invariants already identified, not your summary of what was done or whether it is "solid".
- ask it to find how this fails, by running things.

## Final cycle: Document, Polish, Follow-up, Respond

1. Re-read the user's latest request and recall the context in which it came up. Have you addressed each expectation? To what extent?
2. Briefly say what you verified (commands run, results), and point the user how they can replicate your observations. Also say what remains to be addressed.
3. Record unresolved bugs, missing tests and ideas in the most appropriate place of the project's existing documentation, one line each. Update docs the change made stale;
4. Before wrapping up, review the best practices below and ensure you follow them.
5. Proceed to complete the gaps, if significant
6. Respond: Give a clear answer to the user request, linking the relevant materials generated. Suggest possible follow-ups that you consider high-value, asking the user to choose or authorize a specific direction, if relevant.

Note: do not run operations that may destroy the work done earlier (e.g. remove files). If relevant, write these planned commands down for the end user to execute, including from which folder they must be executed.

---
{reference:../../copilot-instructions.md:Best Practices}

