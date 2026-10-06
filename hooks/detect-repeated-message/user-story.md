# Detect repeating message

Highly quantized local models tend to struggle with long context windows, occasionally getting into loops.
We'd like to make the agent know when it is getting into a loop, specifically, when the agent produces two identical consecutive assistant tool call messages.

We'd like to interrupt this behavior, and ideally highlight it to the agent to give it a chance to recover.

## Design

### Input

The hook receives a JSON event via stdin. It expects:

- `hook_event_name`: the VS Code hook event name (e.g. `"PreToolUse"`)
- `transcript_path`: (optional) file path to a JSONL/JSON transcript

### Processing pipeline

1. **Event validation** — The hook only runs when `hook_event_name === 'PreToolUse'`. For any other event it returns `continue: true` with a `systemMessage` explaining the mismatch.

2. **Transcript availability** — If `transcript_path` is missing or the file does not exist, the hook returns `continue: true` silently (no warning).

3. **Parsing** — The transcript file is read and parsed using one of two strategies:
   - **JSON** — If the file content is valid JSON and is an object (not an array), the hook calls `extractAssistantMessages()` to find assistant messages inside known array keys (`events`, `messages`, `requests`).
   - **JSONL** — If the content is not valid JSON, the hook falls back to `parseJsonl()`, which handles both newline-separated records and adjacent JSON records without separators (stream format). Each record is checked for `{ role: 'assistant'|'bot', content: '...' }` or equivalent structures.

4. **Message extraction** — The hook recognizes multiple transcript formats:
   - Simple: `{ role: 'assistant'|'bot', content: '...' }` or `{ role: 'assistant'|'bot', content: [{ type: 'text', text: '...' }] }`
   - Nested author/body: `{ author: { name: 'assistant' }, body: { parts: [{ text: '...' }] } }`
   - Speaker/value: `{ speaker: 'copilot', value: [{ text: '...' }] }`
   - Structured events: `{ type: 'assistant_message', data: { ... } }` or `{ type: 'chat_message', data: { ... } }`
   - Request/response: `{ requests: [{ response: '...' }] }` or `{ requests: [{ response: [{ kind: 'text', value: '...' }] }] }` (bare string responses also supported)

> **Rot-prevention**: This format list should be updated whenever new extraction patterns are added to the code. If a new format is supported but not listed here, the testing narrative will not reflect the full coverage scope.

5. **Comparison** — Only the **last two** assistant messages are compared for exact string equality. Historical repeats (e.g. messages 1 and 2 are identical, but message 3 is different) do not trigger.

6. **Output** — If the last two messages are identical:
   ```json
   { "continue": false, "stopReason": "Detected identical consecutive agent message. The agent appears to be stuck in a repeating loop." }
   ```
   Otherwise:
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

### Hook registration

Registered at `PreToolUse` (not `Stop`) in [detect-repeated-message.json](detect-repeated-message.json).

### Supported role name variations

`'assistant'`, `'bot'`, `speaker: 'copilot'`, `author.name: 'assistant'`

### Unsupported formats

- `{ transcript: [...] }` — the key name `transcript` is not among the recognized array keys (`events`, `messages`, `requests`). A negative test confirms the hook returns `continue: true` for this format.

### Uncovered edge cases (acceptable gaps)

The following code paths exist but have no dedicated test. They are low-risk because they are simple type checks within well-tested extraction functions:

- `event.type === 'tool'` (skipped alongside `tool_result`)
- Bare string response in request/response format (`{ requests: [{ response: 'text' }] }`)
- `author.name: 'assistant'` or `speaker: 'copilot'` in raw JSONL (tested via JSON wrapper, not raw JSONL)

## Testing Narrative

### What is being tested (16 tests total)

| Category | Tests | What they verify |
|---|---|---|
| **Core detection** | 1 | Identical consecutive assistant messages → `continue: false` with `stopReason` |
| **Transcript parsing** | 7 | Each supported wrapper format (`events`, `messages`, `requests`, adjacent JSONL, nested content arrays, alternative wrappers); unsupported format (`transcript` key) returns `continue: true`. Note: some message formats are tested via JSON wrapper rather than raw JSONL. |
| **Filtering** | 1 | `tool_result` events are skipped (they may contain assistant-shaped data) |
| **Temporal scope** | 1 | Only the latest pair is compared; historical repeats with a new third message do not trigger |
| **Edge cases** | 6 | Empty transcript, user-only, single message, missing path, malformed JSON, role variations |
| **Configuration** | 1 | Hook is registered at `PreToolUse` only; running at `Stop` produces a `systemMessage` |

### Why this is sufficient

The 16 tests cover the **complete detection pipeline**: message extraction from every supported wrapper format, filtering of non-assistant events, comparison of consecutive pairs, and output generation. The 7 parsing tests exercise every code path in `extractAssistantMessages()` — each wrapper key (`events`, `messages`, `requests`, adjacent JSONL), nested content arrays, alternative wrappers, and the unsupported format path. The filtering test verifies that `tool_result` events are correctly skipped. The temporal scope test confirms only the latest pair is compared, preventing false positives from historical repeats. The 6 edge case tests cover empty/missing/malformed inputs and role variations, ensuring graceful degradation. The configuration test validates the hook's behavior when run at the wrong event type. All tests run the hook as a subprocess via `spawnSync`, exercising the actual execution path rather than importing the module.

The untested graceful-degradation paths (missing files, malformed JSON) are low-risk because they are simple type checks that return a fixed value — there is no state mutation or branching logic that could introduce subtle bugs.

### Live session testing

1. Start a coding session requiring multiple tool calls.
2. Normal sessions with varied messages should proceed without interruption.
3. If two identical consecutive assistant messages appear, the hook intercepts at `PreToolUse` and returns `continue: false`.
4. Repeated tool *types* with different parameters should not trigger (only identical content matters).

**PASS criteria**: Copilot continues working normally across multiple tool calls with varied messages; no false-positive interruptions.

**FAIL criteria**: Copilot is blocked with `stopReason: "Detected identical consecutive agent message"` during normal operation with varied messages, or the hook crashes instead of returning `{ continue: true }` on errors.

### Known limitation

VS Code's `PreToolUse` event does not currently provide `transcript_path`. The hook silently returns `continue: true` in this case. When `transcript_path` becomes available, the hook will function fully.
