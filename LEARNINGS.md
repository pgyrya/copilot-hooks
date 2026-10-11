# Learnings worth sharing

- Local AI can be quite effective and attainable with consumer hardware - [Qwen-3.6-35B-A3B-](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/tree/main) is very useful for agentic coding and can be configured with 70K context window to consistently achieve ~20 tokens per second generation on a 10 year old GPU (GTX 1080 Ti) with sufficient RAM (32 GB) - it also has visiion capabilities when mmproj files are loaded
- Subagent reviews can be very focused and helpful, though to be dependable we may still want to focus them further through prompting
- While a significant context size is necessary to explain LLM how to use tools - the quality of response can reduce as this context gets filled up with instructions and information. 
    - It may be better to configure the model to use smaller context size (and have more regular history compactification)
    - Perhaps tool calling harness should evolve to remove most of the tools context from initial prompting, instead adopting just-in-time loading
- A test suite written from the author's mental model of the harness can be large and green while the harness behaves differently. Record real traces (VS Code *GitHub Copilot Chat Hooks* log shows every hook input/output) and replay them; ask for invariants and a pre-mortem ("the user says it doesn't work - why?") rather than a narrative of why the tests are sufficient, which invites advocacy and goes stale.

- **Docker container filesystem is ephemeral**: Changes applied to a running container (e.g., patching Python files) are lost on restart. Always bake patches into the Docker image via Dockerfile COPY+RUN steps.

- **Pre-mortem testing is essential for UAT readiness**: Before declaring something "ready for users," systematically try to break it by testing failure modes (restarts, concurrent sessions, edge cases, network issues). This catches "critical surprises" before they reach users.

- **Completion review cycle (3 cycles) is effective for complex fixes**: CYCLE 1 (revisit goals), CYCLE 2 (verify expectations with invariants + break-tests), CYCLE 3 (document, polish, respond) ensures thorough verification. Key insight: always run break-tests that deliberately try to break your fixes with edge cases.
