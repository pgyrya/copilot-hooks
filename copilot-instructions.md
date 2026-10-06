# Guidelines

## Best Practices

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

### Detecting Issues and Proposing Improvements

Before calling the task complete, ask a subagent to review your contribution - its quality and thoroughness and completion status from the following points of view: 

- the user request(s) collected so far, especially the latest inputs
- the end user, someone applying the developed functionality to achieve a practical goal
- future maintainers who will work on the project after you
- the project general coding and documentation practices
- whether the naming convention is intuitive
- code problems that may be highlighted by the IDE
- whether it can be guaranteed that the existing test fully represent the expected interaction with the feature (and what might be missing)
  - if something is missing from automated tests, consider writing down a simple logical workflow that, when followed by a subagent - can verify the key untested functionality without human intervention - this process should be simple, safe and reliable.
  - when working on a feature as an agent, you could then go through this manual testing process to ensure the feature behaves as expected. If bugs appear, you must plan to create automatic tests that reproduce the issue and verify the fix.
- possible refactoring opportunities to improve code quality, intuitiveness, maintainability, and alignment with project standards.

### Immediate follow-ups 

Keep track of the short-term follow-up tasks using the todo tool:
- Review which todo items still on the list were complete and mark them done if you are confident
- Remove todo items that are no longer relevant
- Add new todo items you consider practical to achieve in this session - focusing on 
  - (key follow-ups) the highest impact adjustments aligned with the user requests and the best practices: we prefer iterating and improving the usability of the work from the point of view of the end user, or from the point of view of future maintainers as it may accelerate development.
  - (low-hanging fruits) If you notice some follow-ups that are simple to complete, also put them earlier on the todo list
    - As an example, ensure the materials created are properly referenced in the documentation and code comments where applicable, and all the materials that are no longer relevant are no longer referenced.
    - If these materials replace older versions, see if we are ready to remove the older version(s) and any references to them - by moving them and running tests to ensure nothing breaks.
  - Each todo item should have a detailed description explaining what needs to be done and why - to keep the context clear.

For the key follow-ups that deserve to be represented in the repository documentation (e.g. persistent bugs), make sure to clearly document your point of view including all the relevant context - and reference this file from the todo item.


### Planning longer-term Improvements

For less critical ideas that you may not be able to complete immediately - please reflect them succinctly as a proposal in the future development section of the project documentation.

I am trying to add a link to [test function `completion review: different prompt preserves incomplete cycle`](./hooks/completion-review/verify-completion.cjs#L200)
