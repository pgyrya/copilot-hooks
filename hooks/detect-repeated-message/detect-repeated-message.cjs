const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);

    if (event.hook_event_name !== 'PreToolUse' && event.hook_event_name !== 'Stop') {
      process.stdout.write(
        JSON.stringify({
          continue: true,
          systemMessage: 'detect-repeated-message is not configured for ' + event.hook_event_name + '.'
        })
      );
      return;
    }

    // A Stop retry must not be blocked again, even if the transcript still contains the loop.
    if (event.hook_event_name === 'Stop' && event.stop_hook_active !== false) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    const transcriptPath = event.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    let raw;
    try {
      raw = fs.readFileSync(transcriptPath, 'utf8').trim();
    } catch (error) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    if (!raw) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    // Try parsing as JSON first (structured transcript)
    let messages = [];
    let toolCalls = [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fall back to JSONL parsing (one JSON object per line, or adjacent JSON)
      messages = parseJsonl(raw);
      toolCalls = parseJsonlToolCalls(raw);
      if (messages.length === 0) {
        if (toolCalls.length === 0) {
          process.stdout.write(JSON.stringify({ continue: true }));
          return;
        }
      }
    }

    if (parsed && !Array.isArray(parsed)) {
      messages = extractAssistantMessages(parsed);
      toolCalls = extractToolCalls(parsed);
    }

    const currentToolCall = event.hook_event_name === 'PreToolUse'
      ? toolCallSignature(event.tool_name, event.tool_input)
      : null;
    const repeatedToolCycleLength = currentToolCall
        ? findRepeatedCycleLength([...toolCalls, currentToolCall])
        : null;

    const repeatedCycleLength = messages.length >= 2 ? findRepeatedCycleLength(messages) : null;
    if (repeatedCycleLength !== null) {
      const cycleDescription = `${repeatedCycleLength}-message agent cycle`;
      if (event.hook_event_name === 'Stop') {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'Stop',
              decision: 'block',
              reason:
                `Detected a repeated ${cycleDescription}. Do not repeat the previous responses. ` +
                'Provide one concise, clean summary of the result, attempts, and any blocker.'
            }
          })
        );
        return;
      }

      process.stdout.write(
        JSON.stringify({
          continue: false,
          stopReason:
            `Detected a repeated ${cycleDescription}. The agent appears to be stuck in a repeating loop.`
        })
      );
      return;
    }

    if (repeatedToolCycleLength !== null) {
      process.stdout.write(
        JSON.stringify({
          continue: false,
          stopReason:
            `Detected a repeated ${repeatedToolCycleLength}-call tool cycle (${event.tool_name}). ` +
            'The agent appears to be stuck in a repeating loop.'
        })
      );
      return;
    }

    process.stdout.write(JSON.stringify({ continue: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ continue: true }));
  }
});

/** Return the length of a repeated 1-3 message cycle at the end of the transcript. */
function findRepeatedCycleLength(messages) {
  for (let cycleLength = 1; cycleLength <= 3; cycleLength++) {
    const repeatedLength = cycleLength * 2;
    if (messages.length < repeatedLength) continue;

    const firstCycleStart = messages.length - repeatedLength;
    const secondCycleStart = firstCycleStart + cycleLength;
    const firstCycle = messages.slice(firstCycleStart, secondCycleStart);
    const secondCycle = messages.slice(secondCycleStart);
    if (firstCycle.every((message, index) => message === secondCycle[index])) return cycleLength;
  }
  return null;
}

// ============================================================================
// Parsing helpers
// ============================================================================

/**
 * Parse JSONL content — handles both newline-separated and adjacent JSON records.
 */
function parseJsonl(content) {
  const messages = [];

  // First, try splitting by newlines
  const lines = content.split(/\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try parsing as a single JSON object
    try {
      const obj = JSON.parse(trimmed);
      if (isUserMessage(obj)) {
        messages.length = 0;
        continue;
      }
      const msg = extractMessageFromObj(obj);
      if (msg) {
        messages.push(msg);
      }
      continue;
    } catch (e) {
      // If the line contains multiple adjacent JSON objects, parse them individually
    }

    // Handle adjacent JSON records without separators
    const objs = extractAdjacentJson(trimmed);
    for (const obj of objs) {
      if (isUserMessage(obj)) {
        messages.length = 0;
        continue;
      }
      const msg = extractMessageFromObj(obj);
      if (msg) {
        messages.push(msg);
      }
    }
  }

  return messages;
}

function parseJsonlToolCalls(content) {
  const toolCalls = [];
  const addRecord = record => {
    if (isUserMessage(record)) {
      toolCalls.length = 0;
      return;
    }
    const signature = extractToolCallSignature(record);
    if (signature) toolCalls.push(signature);
  };

  for (const line of content.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      addRecord(JSON.parse(trimmed));
    } catch (error) {
      for (const record of extractAdjacentJson(trimmed)) addRecord(record);
    }
  }
  return toolCalls;
}

function extractToolCalls(obj) {
  const toolCalls = [];
  const events = Array.isArray(obj.events) ? obj.events : [obj];

  for (const event of events) {
    if (isUserMessage(event)) {
      toolCalls.length = 0;
      continue;
    }
    const signature = extractToolCallSignature(event);
    if (signature) toolCalls.push(signature);
  }
  return toolCalls;
}

function extractToolCallSignature(event) {
  if (event.type !== 'tool.execution_start' || !event.data) return null;
  return toolCallSignature(event.data.toolName, event.data.arguments);
}

function toolCallSignature(name, input) {
  if (typeof name !== 'string' || !name) return null;
  return `${name}:${canonicalize(input === undefined ? {} : input)}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Extract multiple JSON objects from a string where they are concatenated without separators.
 * e.g. '{"a":1}{"b":2}' -> [{a:1}, {b:2}]
 */
function extractAdjacentJson(str) {
  const results = [];
  let i = 0;

  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) {
      i++;
    }
    if (i >= str.length) break;

    // Must start with { or [
    if (str[i] !== '{' && str[i] !== '[') {
      i++;
      continue;
    }

    const start = i;
    const bracket = str[i];
    let depth = 1;
    let inString = false;
    let escape = false;

    i++;
    while (i < str.length) {
      const ch = str[i];

      if (escape) {
        escape = false;
        i++;
        continue;
      }

      if (ch === '\\') {
        escape = true;
        i++;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        i++;
        continue;
      }

      if (inString) {
        i++;
        continue;
      }

      if (ch === '{' || ch === '[') {
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          // Found complete JSON object
          const jsonStr = str.substring(start, i + 1);
          try {
            const obj = JSON.parse(jsonStr);
            results.push(obj);
          } catch (e) {
            // Ignore parse errors
          }
          i++;
          break;
        }
      }

      i++;
    }
  }

  return results;
}

/**
 * Extract assistant messages from a structured JSON transcript object.
 * Processes all matching array keys (events, messages, requests) and concatenates results.
 * In practice, transcripts use only one of these formats, so concatenation is safe.
 */
function extractAssistantMessages(obj) {
  const messages = [];

  // Format: { events: [...] } — common VS Code transcript format
  if (Array.isArray(obj.events)) {
    for (const event of obj.events) {
      if (isUserMessage(event)) {
        messages.length = 0;
        continue;
      }

      // Skip tool_result events (they may contain assistant-shaped data but are not actual messages)
      if (event.type === 'tool_result' || event.type === 'tool') {
        continue;
      }

      // Try structured event format first (assistant_message, chat_message, etc.)
      const msg = extractMessageFromEvent(event);
      if (msg) {
        messages.push(msg);
        continue;
      }

      // Also handle simple event format with role/content directly
      if ((event.role === 'assistant' || event.role === 'bot') && typeof event.content === 'string') {
        messages.push(event.content);
        continue;
      }
      if ((event.role === 'assistant' || event.role === 'bot') && Array.isArray(event.content)) {
        const text = event.content
          .filter(part => part.type === 'text' && part.text)
          .map(part => part.text)
          .join('\n');
        if (text) {
          messages.push(text);
        }
      }
    }
  }

  // Format: { messages: [...] } — generic chat format
  if (Array.isArray(obj.messages)) {
    for (const msg of obj.messages) {
      if (isUserMessage(msg)) {
        messages.length = 0;
        continue;
      }
      if (isAssistantRole(msg)) {
        const text = extractTextFromMessage(msg);
        if (text) {
          messages.push(text);
        }
      }
    }
  }

  // Format: { requests: [...] } — request/response transcript format
  if (Array.isArray(obj.requests)) {
    for (const req of obj.requests) {
      if (typeof req.message === 'string' || typeof req.prompt === 'string') {
        messages.length = 0;
      }
      if (req.response) {
        const text = extractResponseText(req.response);
        if (text) {
          messages.push(text);
        }
      }
    }
  }

  return messages;
}

/**
 * Extract a message string from a JSONL record object.
 */
function extractMessageFromObj(obj) {
  // VS Code transcript event: { type: 'assistant.message', data: { content: '...' } }
  if (obj.type === 'assistant.message' && obj.data && typeof obj.data.content === 'string') {
    return obj.data.content || null;
  }

  // Format: { role: 'assistant' or 'bot', content: '...' }
  if ((obj.role === 'assistant' || obj.role === 'bot') && typeof obj.content === 'string') {
    return obj.content;
  }

  // Format: { role: 'assistant' or 'bot', content: [{ type: 'text', text: '...' }] }
  if ((obj.role === 'assistant' || obj.role === 'bot') && Array.isArray(obj.content)) {
    const text = obj.content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
    return text || null;
  }

  // Format: { author: { name: 'assistant' }, body: { parts: [{ text: '...' }] } }
  if (obj.author && obj.author.name === 'assistant' && obj.body) {
    const parts = obj.body.parts || [];
    const text = parts
      .filter(p => p.text)
      .map(p => p.text)
      .join('\n');
    return text || null;
  }

  // Format: { speaker: 'copilot', value: [{ text: '...' }] }
  if (obj.speaker === 'copilot' && Array.isArray(obj.value)) {
    const text = obj.value
      .filter(v => v.text)
      .map(v => v.text)
      .join('\n');
    return text || null;
  }

  return null;
}

/**
 * Extract a message string from a structured event object.
 */
function extractMessageFromEvent(event) {
  // VS Code transcript event
  if (event.type === 'assistant.message' && event.data && typeof event.data.content === 'string') {
    return event.data.content || null;
  }

  // assistant_message event
  if (event.type === 'assistant_message' && event.data) {
    if (event.data.author && event.data.author.name === 'assistant' && event.data.body) {
      const parts = event.data.body.parts || [];
      const text = parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n');
      return text || null;
    }
  }

  // chat_message event
  if (event.type === 'chat_message' && event.data) {
    if (event.data.speaker === 'copilot' && Array.isArray(event.data.value)) {
      const text = event.data.value
        .filter(v => v.text)
        .map(v => v.text)
        .join('\n');
      return text || null;
    }
  }

  return null;
}

/**
 * Check if a message object represents an assistant message.
 */
function isAssistantRole(msg) {
  if (msg.role === 'assistant') return true;
  if (msg.role === 'bot') return true;
  if (msg.speaker === 'copilot') return true;
  if (msg.author && msg.author.name === 'assistant') return true;
  return false;
}

/** Check whether a transcript record marks the start of a new user turn. */
function isUserMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (
    msg.role === 'user' ||
    msg.speaker === 'user' ||
    (msg.author && msg.author.name === 'user') ||
    msg.type === 'user_message' ||
    msg.type === 'user.message'
  ) {
    return true;
  }
  return Boolean(msg.data && isUserMessage(msg.data));
}

/**
 * Extract text content from a message object.
 */
function extractTextFromMessage(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
  }
  return null;
}

/**
 * Extract text from a response array (request/response format).
 */
function extractResponseText(response) {
  if (typeof response === 'string') return response;
  if (Array.isArray(response)) {
    return response
      .filter(r => r.kind === 'text' && r.value)
      .map(r => r.value)
      .join('\n');
  }
  return null;
}
