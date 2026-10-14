# Detect repeating messages

Highly quantized local models tend to struggle with long context windows, occasionally getting into loops.

When the agent repeats one message or a 2-3 message cycle within the same user turn, interrupt a pending tool call or prompt the agent to recover with one concise summary. Repeated tool calls are compared by tool name and arguments; tool results do not count as calls, and a new user message resets both comparison windows.

## Design

### Input

The hook receives a JSON event via stdin. It expects:

- `hook_event_name`: the VS Code hook event name (e.g. `"PreToolUse"`)
- `transcript_path`: (optional) file path to a JSONL/JSON transcript
- `tool_name` and `tool_input`: the pending tool call on `PreToolUse`

### Processing pipeline

1. **Event validation** — The hook handles `PreToolUse` and `Stop`. For any other event it returns `continue: true` with a `systemMessage` explaining the mismatch. A `Stop` event is only evaluated when `stop_hook_active === false`; missing or true values fail open so the hook cannot repeatedly block a retry.

2. **Transcript availability** — If `transcript_path` is missing or the file does not exist, the hook returns `continue: true` silently (no warning).

3. **Parsing** — The transcript file is read and parsed using one of two strategies:
   - **JSON** — If the file content is valid JSON and is an object (not an array), the hook calls `extractAssistantMessages()` to find assistant messages inside known array keys (`events`, `messages`, `requests`), and extracts tool calls from an `events` array or a standalone tool event object.
   - **JSONL** — If the content is not valid JSON, the hook falls back to the JSONL parsers, which handle newline-separated records and adjacent JSON records without separators. Assistant text and executed tool calls are extracted separately.

4. **Message extraction** — The hook recognizes multiple transcript formats and resets the collected assistant history at user-message boundaries:
   - Simple: `{ role: 'assistant'|'bot', content: '...' }` or `{ role: 'assistant'|'bot', content: [{ type: 'text', text: '...' }] }`
   - VS Code JSONL event: `{ type: 'assistant.message', data: { content: '...' } }`; `{ type: 'user.message', data: { content: '...' } }` resets the assistant history
   - VS Code executed tool call: `{ type: 'tool.execution_start', data: { toolName: 'read_file', arguments: { ... } } }`
   - Nested author/body: `{ author: { name: 'assistant' }, body: { parts: [{ text: '...' }] } }`
   - Speaker/value: `{ speaker: 'copilot', value: [{ text: '...' }] }`
   - Structured events: `{ type: 'assistant_message', data: { ... } }` or `{ type: 'chat_message', data: { ... } }`
   - Request/response: `{ requests: [{ response: '...' }] }` or `{ requests: [{ response: [{ kind: 'text', value: '...' }] }] }` (bare string responses also supported)

> **Rot-prevention**: This format list should be updated whenever new extraction patterns are added to the code. If a new format is supported but not listed here, the testing narrative will not reflect the full coverage scope.

5. **Comparison** — Within the latest user turn, the hook checks two suffixes:
   - Assistant text: two identical consecutive blocks of length 1, 2, or 3, using exact string equality. Tool events/results do not break this sequence.
   - Tool calls: previously executed `tool.execution_start` signatures plus the pending PreToolUse call, where a signature is the tool name and canonicalized arguments. Repeated blocks of length 1, 2, or 3 block; the same tool with different arguments does not.
   A user message resets both sequences. Assistant reasoning messages and turn boundaries do not reset tool-call history.

6. **Output** — On `PreToolUse`, a detected assistant-message or tool-call cycle stops agent execution:
   ```json
   { "continue": false, "stopReason": "Detected a repeated 1-message agent cycle. The agent appears to be stuck in a repeating loop." }
   ```
   On `Stop`, a detected cycle with `stop_hook_active === false` blocks stopping once and asks the agent for a concise summary. The next Stop attempt is allowed because `stop_hook_active` is then true. Otherwise:
   ```json
   { "continue": true }
   ```

### Graceful degradation

The hook returns `{ continue: true }` silently (no `systemMessage`) in all error paths:
- Missing or unreadable `transcript_path`
- Empty transcript
- Fewer than 2 assistant messages
- Malformed JSON that yields no parseable messages
- Unsupported wrapper formats (e.g. `{ transcript: [...] }`)
- Stop event without `stop_hook_active === false` (prevents repeated blocking)

### Hook registration

Registered at both `PreToolUse` and `Stop` in [detect-repeated-message.json](../detect-repeated-message.json). `PreToolUse` handles loops that are about to make another tool call; `Stop` handles loops that produce repeated messages without tool calls.

### Supported roles and event names

Assistant: `'assistant'`, `'bot'`, `speaker: 'copilot'`, `author.name: 'assistant'`, `type: 'assistant.message'`

User-turn reset: `role: 'user'`, `speaker: 'user'`, `author.name: 'user'`, `type: 'user_message'`, `type: 'user.message'`

### Unsupported formats

- `{ transcript: [...] }` — the key name `transcript` is not among the recognized array keys (`events`, `messages`, `requests`). A negative test confirms the hook returns `continue: true` for this format.

### Uncovered edge cases (acceptable gaps)

The following code paths exist but have no dedicated test. They are low-risk because they are simple type checks within well-tested extraction functions:

- `event.type === 'tool'` (skipped alongside `tool_result`)
- Bare string response in request/response format (`{ requests: [{ response: 'text' }] }`)
- `author.name: 'assistant'` or `speaker: 'copilot'` in raw JSONL (tested via JSON wrapper, not raw JSONL)

## Testing

Run: `node --test detect-repeated-message.test.cjs`

The subprocess tests run the hook process directly. Key invariant-to-test links:

- Repeated 1-3 assistant-message cycles block at `PreToolUse`, including across tool events: `interrupts identical consecutive agent messages`, `interrupts a repeated two-message cycle across tool results`, `parses VS Code assistant.message events across tool events`, and `interrupts a repeated three-message cycle`.
- Repeated tool-call signatures block across reasoning text and turn boundaries, while different arguments do not: `blocks an identical tool call across reasoning and turn boundaries`, `allows the same tool with different arguments`, `canonicalizes tool argument key order`, and `blocks a repeated two-call tool cycle`.
- A new user message resets the tool-call history; a standalone JSON execution event is not dropped: `a user message resets tool-call history` and `canonicalizes tool argument key order`.
- A new user message starts a fresh comparison window: `a user message breaks the assistant cycle` and `VS Code user.message events reset assistant history`.
- A repeated no-tool loop blocks one Stop only when `stop_hook_active` is false; absent/true values allow: `blocks a no-tool loop once at Stop and allows the retry`.
- Missing, malformed, or unsupported transcript inputs fail open: `missing transcript_path returns continue: true`, `malformed JSON transcript returns continue: true`, and `{ transcript: [...] } format is handled`.

Transcript schemas can change, so live verification remains necessary after VS Code or harness updates.

### Live session testing

1. Reload VS Code after the hook configuration change and start a Local agent session. Confirm both `detect-repeated-message.cjs` and `verify-completion.cjs` run at Stop, and that the repetition recovery reason remains visible when both block.
2. Confirm varied assistant messages, repeated tool types with different content, and identical answers separated by new user prompts proceed normally.
3. Exercise repeated identical tool calls and a repeated 2-message tool-call cycle; confirm `PreToolUse` interrupts them while different arguments proceed. The hook log redacts `tool_input`, so confirm this behavior from the live outcome rather than by inspecting logged argument values.
4. Exercise a repeated no-tool message cycle and confirm `Stop` requests one concise summary, then allows the following Stop attempt.

**PASS criteria**: Normal varied work continues; a repeated cycle is caught at the appropriate event; and Stop does not block more than once for the same retry chain.

**FAIL criteria**: Normal varied work is blocked, the no-tool cycle is missed despite appearing in the transcript, Stop blocks repeatedly, or the hook crashes instead of failing open on transcript errors.

### Known limitations

- `transcript_path` is optional and transcript formats may change. If the path is absent or the format is unsupported, detection fails open.
- Detection requires two complete repetitions of the cycle within one user turn; it does not predict a loop from a single pass.
- Stop provides a single recovery prompt. If the agent repeats again on that retry, the hook allows stopping rather than risking an indefinite block.
