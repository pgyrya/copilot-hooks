# Guidelines
## Best Practices

- Follow the general coding and documentation practices established in each project / repository - see e.g. corresponding `AGENTS.md`, `README.md`, `CONTRIBUTING.md` and inspect existing examples to align with the best practices
- Always verify your work for accuracy and completeness.
  - before calling work done, try to disprove it: (1) write each invariant the work must uphold in one sentence (what must hold no matter what else happens); (2) pre-mortem - suppose the user says "this does not work": list the 3 likeliest causes, especially assumptions about inputs, events, ordering or other systems that you did not observe, and check them against real logs/traces/files where they exist; (3) each test must trace to an invariant or to an observed failure - prefer a few high-signal tests (trace replay, property checks) over many enumerations; (4) break the code on purpose and confirm a test fails.
  - do not write "why this is sufficient" essays or test counts; keep a short "invariant -> test" list next to the tests.
  - it is 100x better to thoroughly plan and call out any incompletion than to pretend the work is complete.
  - test manually first (using the full suite of tools available to you), then translate the key checks (especially those that show issues) - into automated tests; when a bug shows up in real use, add the real event sequence as a test.
- Use task planning tool to keep track of tasks that need to be completed or revisited.
  - The action items should be clear, actionable, and regularly updated to reflect the current status of tasks.
- Also log the work envisioned in the repository according to the established practices and documentation guidelines.
  - Make sure to succinctly log improvement ideas, bugs, unresolved issues encountered during development and testing, so that they can be addressed and tracked effectively.
    - Find an optimal place to visibly and succinctly log this information in accordance to the project's established documentation practices and aligning to the extent possible with the pre-existing structure.
- Avoid documenting what can quickly get out of sync as each project / repository evolves (e.g. specific info in the readme)
  - Avoid duplication of the information - prefer linking specific documents (code, docs in the subfolder for specific information that may evolve)
  - if the information appears somewhere, it should be clear for the future maintainers to go and update it when making changes - e.g. add a small note to CONTRIBUTING.md around where different type of information belongs
  - It is good to document what is mentioned in the general practices of the repo (instructions for the agents)
- When you get lost in the weeds, take a step back and review the overall goals and high-level design to regain perspective.
