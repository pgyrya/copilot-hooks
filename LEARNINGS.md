# Learnings worth sharing

- Local AI can be quite effective and attainable with consumer hardware - [Qwen-3.6-35B-A3B-](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/tree/main) is very useful for agentic coding and can be configured with 70K context window to consistently achieve ~20 tokens per second generation on a 10 year old GPU (GTX 1080 Ti) with sufficient RAM (32 GB) - it also has visiion capabilities when mmproj files are loaded
- Subagent reviews can be very focused and helpful, though to be dependable we may still want to focus them further through prompting
- While a significant context size is necessary to explain LLM how to use tools - the quality of response can reduce as this context gets filled up with instructions and information. 
    - It may be better to configure the model to use smaller context size (and have more regular history compactification)
    - Perhaps tool calling harness should evolve to remove most of the tools context from initial prompting, instead adopting just-in-time loading
