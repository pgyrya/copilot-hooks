# Contributing

Looking forward to community contributions on this repo - please feel free to raise issues and/or offer thought-through PRs to resolve them.

## General Philosophy

We consider a change to this repository an improvement if 

1. Even with a locally hosted LLM fitting in a consumer workstation, we can observe a meaningful improvement to the quality, stability and robustness of the agentic process -  ideally without spending unnecessary tokens or human review time (we ought to find a configurable balance).
2. The changes are generic enough to be useful to multiple developers.

## Iterative approach idea

A simple recursive development workflow could then be:

- User offers ideas (or a general prompt), asking an agent to enhance this repository and optionally adjusts some parameters of the harnesses (e.g. set number of review cycles to 10)
- The agent follows the established principles to propose modifications, and follows the established hooks to revisit these changes
- As the instructions given to the agent evolve and are updated live, so does the agentic process
- User reviews the quality of the process, the final results and time spent by the agent iterating, and shapes the changes that are believed to be promising into a PR, arguing why this is considered promising.

See [TODO.md](TODO.md) for the changes considered, and some of the recent changes implemented.

## Organizing Materials

See [hooks readme](./hooks/README.md) and the file structure in the directory for examples of how to organize new hooks (e.g. user story, code, tests, prompts).

Only keep the most relevant changes in the [CHANGELOG.md](./CHANGELOG.md)
