## Review and Follow-up
### Detecting Issues and Proposing Improvements

Before calling the task complete, ask a subagent to critically review your contribution - its quality, thoroughness and completion status from the following points of view: 

- the user request(s) collected so far, especially the latest inputs
- the end user, someone applying the developed functionality to achieve a practical goal
- future maintainers who will work on the project after you
- the project general coding and documentation practices
- whether the naming convention is intuitive
- code problems that may be highlighted by the IDE
- whether it can be guaranteed that the included test suite fully represents the expected interaction with the feature (and what might be missing)?
  - Is the testing scope clearly thorough, clearly lacking - or does it require a narrative to figure out whether it's sufficient? If it's not obvious, assume the latter.
    - Do tests unnecessarily hard-code/assume fixed values of the elements that may be modified by the user?
  - if something is missing from automated tests, consider writing down a simple logical workflow that, when followed by a subagent - can verify the key untested functionality without human intervention - this process should be simple, safe and reliable.
  - when working on a feature as an agent, you could then go through this manual testing process to ensure the feature behaves as expected. If bugs appear, you must plan to create automatic tests that reproduce the issue and verify the fix.
- possible refactoring opportunities to improve code quality, intuitiveness, maintainability, and alignment with project standards.
- whether the project documentation readable and up to date?
  - does it reflects the current implementation?
  - is this documentation readable and is it simple to digest (e.g. does it follow a logical flow)?

Give it the relevant session/task context and ask for concrete gaps or risks, not a generic approval.

## Planning Follow-ups

Revisit the original user request and current implementation to address material gaps found by this review as follows:

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

Furthermore, for key follow-ups that deserve to be represented in the repository documentation until they are resolved (e.g. persistent bugs, missing tests), make sure to clearly document your point of view including all the relevant context - referencing this file from the todo item.

### Planning longer-term Improvements

For less critical ideas that you may not be able to complete immediately - please reflect them succinctly as a proposal in the future development section of the project documentation.

Report any remaining limitations that are not practical to solve in this session, along with your recommendations of how to resolve them
