# Effective Agentic Development with Copilot

## Introduction

This initiative has grown out of initial frustration with even the best locally-deployable agentic systems claiming the clearly-formulated work was done only to find out that it may take more developers' time to review the work than to write it from scratch, and/or iterate with AI assistant, always pointing out what's wrong just to get more issues and blind spots in the resulting code.

The big labs' proposed solution is to build and sell us the use of much more capable models, however they do get expensive to run and have a fundamental issue of sending our potentially sensitive data out in the open.

As of 2026, there are already models that are capable or comfortable reasoning and fluently driving agentic workflows - and in a local setup they can read and write faster than humans. If we are not getting good results with them - perhaps it is because we have not yet learned to optimally utilize their abilities for our cause?

## Mission

The mission of this repo is to learn to effectively outsource significant volume of cognitive work we are used to as developers - to even locally deployed LLM models in the context of using Copilot in an autopilot mode.

It shares a working setup and best practices around how we can aim to make even local agentic development with VS Code Copilot practical and effective - by strategically injecting focus in the interaction with the agent.

This could unlock "iterative local development" and perhaps even "recursive self improvement" of this toolset - which can then be applied to help focus the work of both local and state-of-the art language models.

Specifically, the goal is to have these Copilot sessions produce meaningful improvements, at a configurable cost of more compute time, rather than creating more blind spots and more issues than they are solving.

As a side effect of this approach, we may be synthesizing a solid set of instructions that can make us personally become productive in contributing to a common code base.

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

### 1. Add the repository to your existing folder

Add this repository to your existing `~/.copilot` directory. VS Code reads the instructions from this location and registers hook configurations from `~/.copilot/hooks/`.

```bash
cd ~/.copilot
git init
git remote add origin https://github.com/pgyrya/.copilot/
git fetch origin/main
git checkout -b main origin/main
```

This uses standard git commands to initialize a local repo in your existing folder, set the remote, fetch the remote, and create a `main` branch — **without requiring `rsync` or a temporary directory**. The `git checkout -b main origin/main` creates a new branch from the fetched remote, so it **does not overwrite** any existing files that aren't tracked by this repository. Your existing files (like custom configurations) remain untouched.

### 2. Install Node.js

The hooks run as Node.js command-line programs using only built-in modules (`fs`, `path`, `child_process`, `crypto`) — **no `npm install` required**.

Install a supported Node.js LTS release (v18 or later) and make the `node` executable available on the `PATH`.

**Recommended installation methods:**

- **Debian/Ubuntu (apt):** `sudo apt install nodejs`
- **nvm:** `nvm install --lts` then `nvm use --lts`
- **fnm:** `fnm install --lts` then `fnm use --lts`
- **NodeSource repo:** Follow [nodeSource instructions](https://github.com/nodesource/distributions) for a persistent LTS installation
- **macOS (Homebrew):** `brew install node`
- **Windows:** Download LTS from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)

**Verify the installation:**

```bash
node --version   # expect v18.x or later
node -p "process.execPath"  # note the absolute path — you'll need it below
```

### 3. Ensure VS Code inherits the Node.js PATH

This is the most common source of hook failures. If you use a version manager (`nvm`, `fnm`, `n`), VS Code launched from a desktop shortcut or launcher may **not** inherit the shell PATH where `node` is available.

**Diagnose the issue:**

Run this in a VS Code integrated terminal:

```bash
node -p "process.execPath"
```

If it prints a path different from (or not the same as) what you see in a regular terminal, VS Code is not using the correct Node.js.

**Fix options (pick one):**

| Approach | How |
|---|---|
| **A. Launch VS Code from a working terminal** | `code &` from a shell where `node` works. This inherits the full PATH. |
| **B. Use absolute paths in hook configs** | Replace `node` with the full path from `process.execPath` in each `hooks/*.json` file. |
| **C. Set `terminal.integrated.env.*`** | Add `"terminal.integrated.env.linux": { "PATH": "/path/to/node-dir:/usr/local/bin:/usr/bin:/bin" }` (or `terminal.integrated.env.windows` / `terminal.integrated.env.osx`) to `settings.json`, including the directory containing your Node.js executable. |

**Option B — absolute paths (fully explicit, most reliable):**

Open each hook config file and replace the `node` command with the absolute path:

```jsonc
// Before (relative command)
"command": "node ~/.copilot/hooks/completion-review/verify-completion.cjs"

// After (absolute path — use the path from `process.execPath`)
"command": "/usr/bin/node ~/.copilot/hooks/completion-review/verify-completion.cjs"
```

After changing any hook configuration, **reload the VS Code window** (`Ctrl+Shift+P` → "Developer: Reload Window").

### 4. Verify the hooks

Run the hook tests to confirm the implementations execute correctly:

```bash
cd ~/.copilot/hooks/completion-review && node --test verify-completion.test.cjs
cd ~/.copilot/hooks/detect-repeated-message && node --test detect-repeated-message.test.cjs
```

Both should pass with no errors.

### 5. Configure hook behavior (optional)

Each hook has configurable parameters at the top of its `.cjs` file (e.g., the review cycle count in `completion-review/verify-completion.cjs`). Edit these values to adjust how aggressively the hooks enforce practices.

See [hooks/README.md](./hooks/README.md) for the full hook layout, state directory structure (`.state/`), and per-feature documentation.

### 6. Start a Copilot session in Local Mode

The hooks and instructions saved in the folder `~/.copilot` - are only functional when AI assistant runs in Local Mode.

## Local LLM Configuration

This section explains how to configure VS Code to use a locally-deployed LLM as the primary workhorse — running entirely in "Local" mode (no cloud Copilot plan required), optionally with Autopilot enabled.

Steps 1–3 are **required** to get your local model working. Steps 4–6 are **optional** enhancements for utility tasks and Agent Host sessions.

> **Last verified:** 2026-10-07 against [VS Code AI Settings Reference](https://code.visualstudio.com/docs/agents/reference/ai-settings). Settings verified: `chat.permissions.default`, `chat.utilityModel`, `chat.utilitySmallModel`, `chat.byokUtilityModelDefault`, `chat.agentHost.byokModels.enabled`. Configuration file schemas (`chatLanguageModels.json`) are based on observed Copilot extension behavior and are **not guaranteed to be stable**.

### Prerequisites

- A local LLM server running on your machine (see [llama_cpp](../llama_cpp) for the recommended Docker + CUDA setup)
- **GPU with sufficient VRAM**: Qwen3.6-35B-Q4_K_M requires ~20 GB VRAM; smaller models need less (see [llama_cpp Prerequisites](../llama_cpp/README.md#prerequisites) for full hardware requirements)
- Docker and Docker Compose installed

See the [llama_cpp README](../llama_cpp/README.md) for full setup instructions including Docker Compose configuration, model management, and MCP server integration.

### 1. Start the Local LLM Server

Start the local LLM server - e.g. `llama.cpp` is highly optimized for local deployment.

The server exposes an **OpenAI-compatible API** at `http://localhost:41980` (base URL). The full chat completion endpoint is `http://localhost:41980/v1/chat/completions`. See [llama_cpp README](../llama_cpp/README.md) for details.

### 2. Add a Custom Endpoint in VS Code

1. Open the **Language Models editor** via Command Palette (`Ctrl+Shift+P`):
   - Run `Chat: Manage Language Models`

2. Click **Add Models** → select **Custom Endpoint**

3. Enter a group name (e.g., "Local")

4. Enter a display name and leave the API key empty (local models don't require authentication)

5. Select the API type: **Chat Completions**

6. VS Code opens a `chatLanguageModels.json` file — update it with your model configuration:

```jsonc
[
  {
    "name": "Local",
    "vendor": "customendpoint",
    "apiKey": "",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "qwen3.6-35b-a3b",
        "name": "Qwen3.6-35B-A3B-Q4_K_M",
        "url": "http://localhost:<PORT>",
        "toolCalling": true,
        "vision": true,
        "maxInputTokens": 61440,
        "maxOutputTokens": 8192
      }
    ]
  }
]
```

> **Note:** The UI navigation steps above reflect the current Copilot extension interface. Menu labels and navigation paths may change in future versions. The `chatLanguageModels.json` file format is an internal implementation detail — the UI flow (Add Models → Custom Endpoint) is the only supported method.

**Configuration reference:**

| Property | Description |
|---|---|
| `id` | Internal model identifier (used in settings references like `chat.utilityModel`) |
| `name` | Display name shown in the model picker |
| `url` | Endpoint URL for the model (llama.cpp: `http://localhost:41980`) |
| `toolCalling` | Set to `true` if the model supports tool calling (required for Agent mode) |
| `vision` | Set to `true` if the model supports image inputs |
| `maxInputTokens` | Maximum input tokens (context window minus maxOutputTokens) |
| `maxOutputTokens` | Maximum output tokens per response |

> **Note:** The sum of `maxInputTokens` + `maxOutputTokens` must not exceed the model's context window. Leave a safety margin (e.g., 1–2K tokens) for system prompts, tool definitions, and conversation history. Adjust based on your model's actual capabilities and available VRAM.

### 2.5 (Optional) Manual `chatLanguageModels.json` Configuration

> **Warning:** The `chatLanguageModels.json` schema is an internal implementation detail of the Copilot extension and may change without notice. Property names and values (`vendor`, `apiType`, `toolCalling`, `vision`) are based on observed behavior and are **not guaranteed to be stable**. The UI flow described in Step 2 is the only supported method. Manual file editing is error-prone and not recommended.

If you need to edit the file manually, it is stored in the Copilot extension's global storage:
- **Linux:** `~/.config/Code/User/globalStorage/github.copilot-chat/chatLanguageModels.json`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/chatLanguageModels.json`
- **Windows:** `%APPDATA%\Code\User\globalStorage\github.copilot-chat\chatLanguageModels.json`

To locate it: run `Developer: Open Global Storage Folder` from the Command Palette, then navigate to `github.copilot-chat`.

### 3. Select the Local Model in Chat

After configuring the custom endpoint:

1. Open Copilot Chat view
2. Select Local mode on the bottom-left (Default setting: Copilot) - this represents the host machine orchestrating the chat session. Note - locally hosted models are only available in this mode.
3. Click the model picker (shows the current model name)
4. Select your local model from the group you configured (e.g., "Local")

The model should now appear in the picker. If it doesn't, **reload VS Code** (`Ctrl+Shift+P` → "Developer: Reload Window").

> **Switching back to cloud model:** To switch back to a cloud Copilot model, select it from the model picker in the Chat view.

### 4. Enable Autopilot Mode by default (Optional)

> **Prerequisites:** Autopilot mode requires VS Code 1.99 or later (when `chat.agent.enabled` was introduced). Agent mode must be enabled (`chat.agent.enabled` is `true` by default). The `chat.permissions.default` setting is marked Experimental.

Autopilot mode enables continuous agent-driven development with automatic iteration:

1. Open VS Code Settings (`Ctrl+,`)
2. Search for `chat.permissions.default`
3. Set the value to `"autopilot"` (or include `"autopilot"` in the array if using multiple modes)

Or set it directly in `settings.json`:

```jsonc
{
  "chat.permissions.default": "autopilot"
}
```

> **Note:** The setting `chat.permissions.default` is documented in [VS Code AI Settings Reference](https://code.visualstudio.com/docs/agents/reference/ai-settings). The value `"autopilot"` enables Autopilot mode. For Advanced Autopilot (Experimental), also set `"chat.autopilot.advanced.enabled": true` — this uses a separate model to evaluate whether your request is complete after each Autopilot turn.

With Autopilot enabled, Copilot will automatically plan and execute multi-step tasks, opening terminals, running commands, and iterating on solutions without requiring manual intervention for each step.

### 5. Configure Utility Models (Optional but Recommended)

VS Code uses separate models for background utility tasks (title generation, commit messages, intent detection). Without a GitHub Copilot token, these fall back to built-in utility models that won't work with BYOK.

To enable full utility features with your local model, configure:

```jsonc
{
  "chat.utilityModel": "Local.qwen3.6-35b-a3b",
  "chat.utilitySmallModel": "Local.qwen3.6-35b-a3b"
}
```

The model ID format is `{provider-group}.{model-id}` — the provider group (`Local`) comes from the `"name"` field in the `chatLanguageModels.json` configuration, and the model ID (`qwen3.6-35b-a3b`) comes from the `"id"` field.

For BYOK users, you can also set the utility model to follow the main agent:

```jsonc
{
  "chat.byokUtilityModelDefault": "mainAgentModel"
}
```

> **Note:** These settings (`chat.utilityModel`, `chat.utilitySmallModel`, `chat.byokUtilityModelDefault`) are documented in the [VS Code AI Settings Reference](https://code.visualstudio.com/docs/agents/reference/ai-settings) under BYOK-specific settings. Their behavior may vary by Copilot extension version.

### 6. Enable BYOK Models in Agent Host Sessions (Optional)

If you use Agent Host sessions (e.g., Copilot in the Agents window), enable BYOK model support:

```jsonc
{
  "chat.agentHost.byokModels.enabled": true
}
```

> **Note:** This setting is documented in the [VS Code AI Settings Reference](https://code.visualstudio.com/docs/agents/reference/ai-settings) under Agent Host settings. Its behavior may vary by Copilot extension version.

### What Works and What Doesn't

| Feature | Status with Local BYOK Models |
|---|---|
| Chat conversations | ✅ Full support |
| Agent mode (tool calling) | ✅ With models that support it |
| Autopilot mode | ✅ (requires model with tool calling support) |
| Utility tasks (titles, commits) | ✅ When `chat.utilityModel` is configured |
| Inline suggestions (code completions) | ❌ Requires GitHub Copilot |
| Semantic search | ❌ Requires GitHub Copilot |
| Embeddings | ❌ Requires GitHub Copilot |

> **Key insight:** BYOK models work without signing into a GitHub account and without a Copilot plan. Features that depend on the GitHub Copilot service (semantic search, inline suggestions, embeddings) are not available through BYOK.

> **Note:** Verified settings are documented in the [VS Code AI Settings Reference](https://code.visualstudio.com/docs/agents/reference/ai-settings) as of 2026-10-07. Configuration file schemas are based on observed Copilot extension behavior and may change. Capabilities may change with VS Code and Copilot extension updates.

### Troubleshooting

**Model doesn't appear in the picker:**
- Reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window")
- Verify the server is accessible: `curl -s http://localhost:41980/health` (or `curl http://localhost:41980/v1/chat/completions` — a 400 response is expected and indicates the server is reachable)
- Check the `chatLanguageModels.json` file for syntax errors

**Tool calling not working:**
- Ensure `"toolCalling": true` is set in the model configuration
- Verify the model actually supports tool calling (not all models do)

**Slow responses:**
- Check GPU utilization (`nvidia-smi`) — the model may be falling back to CPU
- Reduce `maxInputTokens` if you're sending very large contexts
- Consider using a smaller quantized model

**MCP tools not available:**
- Ensure the llama.cpp server is configured with MCP proxy support. See [llama_cpp/docker-compose.yml](../llama_cpp/docker-compose.yml) for the current configuration.
- Verify MCP servers are running and configured in the llama.cpp workspace's `.config/mcp-config.json` (see [llama_cpp README](../llama_cpp/README.md))

## See also

- [Contributing](./CONTRIBUTING.md) - instructions around how to contribute to the project
- [Learnings](./LEARNINGS.md) - high-level concise learnings worth sharing across developers
- [llama_cpp](../llama_cpp/README.md) - complete local LLM setup with Docker, CUDA, and MCP integration

