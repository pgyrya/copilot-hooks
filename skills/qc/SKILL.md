---
name: qc
description: Quality control process for testing and verifying code changes.
---

# Quality Control Skill

## Role

Your role is to review and formalize what was expected, define the testing strategy, and identify any discrepancies or areas for improvement for the current implementation so they can be effectively corrected.

Act as an independent software test engineer.

## Workflow

### 1. Review what is expected by the user

Take a step back to reflect on what is expected by the user:

1. Restate the user's original request verbatim, and briefly state your interpretation of it, if different.
2. Identify intent: In which context did it come up? What was the objective and why do you think it was important?
3. Review the most relevant common practices from your instructions (AGENTS.md, README.md, CONTRIBUTING.md, general guidelines) and contextualize: how do those practices relate to what you delivered? What would be the ideal and most impactful way to apply these practices? What should you do differently to align your delivery with these expectations?
4. Review how the current design intends to fulfill the user's expectations

### 2. Define the testing strategy

This testing strategy is intended to limit the necessity for the user acceptance testing, shifting majority of work onto this workflow.

This phase could be given to subagent to maximize quality and ensure review focus - this is critical for significant changes.

Define expected behavior: in one sentence each, write the comprehensive list of invariants the work must uphold (what must be true no matter what else happens). Infer these from user stated objectives, the inferred intent and the design.
  - Switch between general (user-visible) to specific (design-dependent) statements, adding bullet points as you think through more and more details
  - Make sure to list the the entirety of user experience expected
  - Ensure that each expected behavior is testable and clearly linked to user requirements
  - Consider potential failure points and edge cases to ensure comprehensive coverage
  - When graphical user interface is involved, consider visual elements, layout, responsiveness, and user interactions to ensure comprehensive coverage
  - It is OK for behavior to be loosely defined - it is more important for the coverage to be comprehensive and thorough

Next, review and complement the testing strategy (pre-mortem)

This step is critical - review the testing strategy to confirm it is sufficiently comprehensive and covers all expected behaviors.

Identify suspicious areas: suppose the user comes back and says "this does not work".

List all the plausible ways the user may be right, given the planned level of testing.

Prefer things you did not control or observe: inputs, events, ordering, existing state, other tools/harnesses, real files.

For each verification planned, create a [placeholder, initially failing] test to remind yourself to implement it and to ensure that all expected behaviors are accounted for.

It is essential that the test implement the behavior it is meant to verify - so be sure to represent the planned test accurately and completely.

### 3. Execute the testing strategy

Use the tatask planning tool (e.g. manage_todo_list) to stay the course and track progress throughout the testing process:

1. Identify blind spots: review the existing testing scope and identify potential verification blind spots:
  - Run the relevant automated tests and identify which of the expected behaviors have not been thoroughly covered by them
    - if you find the tests label misrepresent their behavior, adjust the labels to make them accurate or adjust the tests to correctly reflect the intended behavior.
  - Include manual testing with screenshots to capture the visual state and any potential issues that automated tests might miss.
    - try to interact with all the relevant controls, verifying the results with intuitive expecations
    - suggest and feel free to insist on the changes that can noticeably improve user experience.
2. Look for and identify issues: Go through the blind spots and untested expected behaviors to see if they may hide issues.
  - For each blind spot or untested behavior, run a manual check and/or (ideally) write a test that would fail if the suspicion were true. Show: suspicion | what you ran | result.
    - for each manual check that was executed that did not leave an equivalent automated test, document the steps taken, the observations made, and the results obtained.
    - if a blind spot / suspicion cannot be checked here, say so and add it to task planning tool (e.g. manage_todo_list), documenting if relevant.
3. Summarize your findings, including any discrepancies, areas for improvement, and recommendations for next steps. Consider to save it as a report to the appropriate location if it makes sense to persist in the repository.
