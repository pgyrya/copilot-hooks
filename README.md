# Effective Agentic Development with Copilot

## Introduction

The objective of this repo is to share a working setup and best practices around how we can aim to make even local agentic development with VS Code Copilot practical and effective.

This initiative has grown out of frustration with even the best locally-deployable agentic systems claiming the clearly-formulated work only to find out that it may take more developers' time to review the work than to write it from scratch, and/or iterate with AI assistant, always pointing out what's wrong just to get more issues in the resulting code.

The big labs' proposed solution is to build and sell us much more capable models, however they are very expensive to run.

As of 2026, there are already models that are capable or comfortable reasoning and fluently driving agentic workflows - and in a local setup they can read and write faster than humans. If we are not getting good results with them - perhaps it is because we have not yet learned to optimally utilize their abilities for our cause?

## Mission

The objective is to learn to effectively outsource significant volume of cognitive work we are used to as developers - to even locally deployed LLM models in the context of using Copilot in an autopilot mode.

This could unlock "iterative local development" and perhaps even "recursive self improvement" of this toolset - which can then be applied to help focus the work of both local and state-of-the art language models.

Specifically, the goal is to have these Copilot sessions produce meaningful improvements, at a configurable cost of more compute time, rather than creating more blind spots and more issues than they are solving.

As a side effect, we may be synthesizing a solid set of instructions that can make us personally become productive in contributing to a common code base.

Perhaps as we polish this approach, we can fully benefit from local development - and even start heating our homes with useful local GPU workflows rather than relying on big data centers that contribute to global warming effect.

After all, we can make the local AI loops very long without worrying about going overbudget.

And even with cloud-native models, the hope is that eventually running a cheap cloud-hosted LLM in this loop may lead to a sustainable and budget-friendly development.

## Structure

This repo contains [general copilot instructions](./copilot-instructions.md), along with [hooks](./hooks/README.md) designed to re-focus the attention of the agent after key events in a way that is intended to improve the process and the final result of the session.

As you can see, these instructions also intend to bring the attention of the agent to repo-specific instructions.

Additional instructions can live in the hook-specific folders - e.g. [review instructions](./hooks/completion-review/completion-review-prompt.md) for the completion review hook.

You may see some lingering AI-driven imperfections in the code, since a significant portion of functionality was designed by a local AI going through VS Code harness loop with the enhancements of this repo.

This is a design tradeoff - while the instructions were carefully designed, the evolution of this repository itself was on purpose done with AI-assisted coding to live-test that the general instructions, guided by user prompts - do in fact iteratively lead to a meaningful improvement in the repo structure and content.

The intention is to clean this up over time as we have multiple developers and AI rounds of iterations for this repo.

## Setup

To benefit from this functionaliy, please clone the contents of this repo into `~/.copilot` folder where the hooks will be automatically registered and the instructions will be automatically picked up and programmatically inserted at agent runtime.

## See also

* [Contributing](./CONTRIBUTING.md) - instructions around how to contribute to the 
* [Learnings](./LEARNINGS.md) - a high-level concise learnings that are worth sharing across developers
* TODO - add a reference to a solid local deployment setup with Llama.cpp

