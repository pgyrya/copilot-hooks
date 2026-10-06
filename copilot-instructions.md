# General Guidelines

- Follow the general coding and documentation practices established in each project / repository - see e.g. corresponding `AGENTS.md`, `README.md`, `CONTRIBUTING.md` and inspect existing examples to align with the best practices
- Always verify your work for accuracy and completeness.
  - for testing to be considered complete you should develop a narrative for why the tests are sufficient to verify the expected behavior - this narrative should be independently verifiable and should live either in testing files or the corresponding documentation.
  - it is 100x better to thoroughly plan and call out any incompletion than to pretend the work is complete.
- Use todo tool to keep track of tasks that need to be completed or revisited.
  - The todo items should be clear, actionable, and regularly updated to reflect the current status of tasks.
- Also log the work envisioned in the repository according to the established practices and documentation guidelines.
  - Make sure to succinctly log improvement ideas, bugs, issues encountered during development and testing, so that they can be addressed and tracked effectively.
    - Find an optimal place to visibly and succinctly log this information in accordance to the project's established documentation practices and aligning to the extent possible with the pre-existing structure.
- Avoid documenting what can quickly get out of sync as each project / repository evolves (e.g. specific info in the readme)
  - Avoid duplication of the information - prefer linking specific documents (code, docs in the subfolder for specific information that may evolve)
  - if the information appears somewhere, it should be clear for the future maintainers to go and update it when making changes - e.g. add a small note to CONTRIBUTING.md around where different type of information belongs
  - It is good to document what is mentioned in the general practices of the repo (instructions for the agents)

## Review and Follow-up

- Before calling the task complete, ask a subagent to review your contribution - its quality and thoroughness and completion status from the point of view of 
  - the user request(s) collected so far, especially the latest inputs
  - the end user, someone applying the developed functionality to achieve a practical goal
  - future maintainers who will work on the project after you
  - the project general coding and documentation practices
  - whether the naming convention is intuitive
  - whether it can be guaranteed that the existing test fully represent the expected interaction with the feature (and what might be missing)
    - if something is missing from automated tests, consider proposing simple logical workflow that, when followed by a subagent - can verify the key untested functionality without human intervention
- Consider possible refactoring opportunities to improve code quality, intuitiveness, maintainability, and alignment with project standards.
- Make sure the materials created are properly referenced in the documentation and code comments where applicable.
  - Also make sure the materials that are no longer relevant are no longer referenced.
  - If these materials replace older versions, see if we are ready to remove the older version(s) and any references to them
- Keep track of the review and subsequent follow-up tasks using the todo tool - by adding new todo items.
  - Add new todo items for highest impact adjustments aligned with the user requests and the best practices.
  - If some are simple to complete, put them earlier on the list
  - Prefer iterating and improving the usability of the work from the point of view of the end user.
  - For ideas that you do not have time to complete immediately, make sure to reflect it succinctly in the future development section of the project documentation.
- Review which todo items were complete and mark them done
