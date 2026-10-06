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

    // This hook is registered at PreToolUse, not at Stop.
    if (event.hook_event_name !== 'PreToolUse') {
      process.stdout.write(
        JSON.stringify({
          continue: true,
          systemMessage:
            'detect-repeated-message is configured to run at PreToolUse, not at ' +
            event.hook_event_name +
            '.'
        })
      );
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
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fall back to JSONL parsing (one JSON object per line, or adjacent JSON)
      messages = parseJsonl(raw);
      if (messages.length === 0) {
        process.stdout.write(JSON.stringify({ continue: true }));
        return;
      }
    }

    if (parsed && !Array.isArray(parsed)) {
      messages = extractAssistantMessages(parsed);
    }

    if (messages.length < 2) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    // Check if the last two messages are identical (only check the most recent pair)
    const lastMsg = messages[messages.length - 1];
    const secondLastMsg = messages[messages.length - 2];
    if (lastMsg === secondLastMsg) {
      process.stdout.write(
        JSON.stringify({
          continue: false,
          stopReason:
            'Detected identical consecutive agent message. The agent appears to be stuck in a repeating loop.'
        })
      );
      return;
    }

    process.stdout.write(JSON.stringify({ continue: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ continue: true }));
  }
});

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
      const msg = extractMessageFromObj(obj);
      if (msg) {
        messages.push(msg);
      }
    }
  }

  return messages;
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
