# Guidelines
## Best Practices

- Follow the general coding and documentation practices established in each project / repository - see e.g. corresponding `AGENTS.md`, `README.md`, `CONTRIBUTING.md` and inspect existing examples to align with the best practices
- Always verify your work for accuracy and completeness.
  - aim for thorough test suite: for testing to be considered complete you should develop a narrative to verify whether the tests are sufficient to ensure the expected behavior - this narrative should be independently verifiable and should live either in testing files or the corresponding documentation.
  - it is 100x better to thoroughly plan and call out any incompletion than to pretend the work is complete.
  - consider to test manually first (using the full suite of tools available to you), then translate the key checks (especially those that show issues) - into automated tests.
- Use todo tool to keep track of tasks that need to be completed or revisited.
  - The todo items should be clear, actionable, and regularly updated to reflect the current status of tasks.
- Also log the work envisioned in the repository according to the established practices and documentation guidelines.
  - Make sure to succinctly log improvement ideas, bugs, unresolved issues encountered during development and testing, so that they can be addressed and tracked effectively.
    - Find an optimal place to visibly and succinctly log this information in accordance to the project's established documentation practices and aligning to the extent possible with the pre-existing structure.
- Avoid documenting what can quickly get out of sync as each project / repository evolves (e.g. specific info in the readme)
  - Avoid duplication of the information - prefer linking specific documents (code, docs in the subfolder for specific information that may evolve)
  - if the information appears somewhere, it should be clear for the future maintainers to go and update it when making changes - e.g. add a small note to CONTRIBUTING.md around where different type of information belongs
  - It is good to document what is mentioned in the general practices of the repo (instructions for the agents)
