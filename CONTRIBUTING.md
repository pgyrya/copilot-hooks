# Contributing

## General Philosophy

We consider a change to this repository an improvement if 

1. Even with a locally hosted LLM fitting in a consumer workstation, we can observe a meaningful improvement to the quality, stability and robustness of the agentic process -  ideally without spending unnecessary tokens or human review time.
2. The changes are generic enough to be useful to multiple developers.

A simple recursive development workflow could then be:

- User offers ideas (or a general prompt), asking an agent to enhance this repository
- The agent follows the established principles to propose modifications, and follows the established hooks to revisit these changes
- As the instructions given to the agent evolve, so is the agentic process
- Human reviews the quality of the process, the final results and time spent by the agent iterating, and shapes the changes that are believed to be promising into a PR.

See [TODO.md](TODO.md) for the changes considered, and some of the recent changes implemented.

## Organizing Materials

See [hooks readme](./hooks/README.md) and the file structure in the directory for examples of how to organize new hooks (e.g. user story, code, tests, prompts).
