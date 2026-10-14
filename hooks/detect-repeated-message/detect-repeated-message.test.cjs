const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const hooksDirectory = __dirname;
const hooksRoot = path.resolve(hooksDirectory, '..');
const repeatHook = path.join(hooksDirectory, 'detect-repeated-message.cjs');
const repeatHookConfig = path.join(hooksRoot, 'detect-repeated-message.json');

function runHook(script, event, home, cwd) {
  const result = spawnSync(
    process.execPath,
    [script],
    {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        VSCODE_AGENT_SESSION_ID: 'hook-test-session'
      },
      input: JSON.stringify(event),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// ============================================================================
// detect-repeated-message.cjs Tests
// ============================================================================

test('repeated-message guard: interrupts identical consecutive agent messages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      JSON.stringify({ role: 'assistant', content: 'Repeated answer.' }),
      JSON.stringify({ role: 'tool', content: 'tool result' }),
      JSON.stringify({ role: 'assistant', content: 'Repeated answer.' })
    ].join('\n')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-message agent cycle/);
});

test('repeated-message guard: interrupts a repeated two-message cycle across tool results', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      { role: 'assistant', content: 'First step.' },
      { role: 'tool', content: 'first tool result' },
      { role: 'assistant', content: 'Second step.' },
      { role: 'tool', content: 'second tool result' },
      { role: 'assistant', content: 'First step.' },
      { role: 'tool', content: 'third tool result' },
      { role: 'assistant', content: 'Second step.' }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    { hook_event_name: 'PreToolUse', tool_name: 'read_file', transcript_path: transcript },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 2-message agent cycle/);
});

test('repeated-message guard: parses VS Code assistant.message events across tool events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      { type: 'assistant.message', data: { content: 'First step.' } },
      { type: 'tool.execution_start', data: { toolName: 'read_file' } },
      { type: 'tool.execution_complete', data: { success: true } },
      { type: 'assistant.message', data: { content: 'Second step.' } },
      { type: 'tool.execution_start', data: { toolName: 'read_file' } },
      { type: 'assistant.message', data: { content: 'First step.' } },
      { type: 'tool.execution_complete', data: { success: true } },
      { type: 'assistant.message', data: { content: 'Second step.' } }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    { hook_event_name: 'PreToolUse', tool_name: 'read_file', transcript_path: transcript },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 2-message agent cycle/);
});

test('repeated-message guard: blocks an identical tool call across reasoning and turn boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  const toolInput = { endLine: 28, filePath: '/repo/LEARNINGS.md', startLine: 28 };
  fs.writeFileSync(
    transcript,
    [
      { type: 'assistant.turn_start', data: { turnId: '1' } },
      { type: 'tool.execution_start', data: { toolName: 'read_file', arguments: toolInput } },
      { type: 'tool.execution_complete', data: { success: true } },
      {
        type: 'assistant.message',
        data: {
          content: '',
          reasoningText: 'I should inspect the same lines again.',
          toolRequests: [{ name: 'read_file', arguments: JSON.stringify(toolInput) }]
        }
      },
      { type: 'assistant.turn_end', data: { turnId: '1' } },
      { type: 'assistant.turn_start', data: { turnId: '2' } }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: toolInput,
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-call tool cycle/);
});

test('repeated-message guard: allows the same tool with different arguments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      type: 'tool.execution_start',
      data: {
        toolName: 'read_file',
        arguments: { endLine: 28, filePath: '/repo/LEARNINGS.md', startLine: 28 }
      }
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { endLine: 29, filePath: '/repo/LEARNINGS.md', startLine: 29 },
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: a user message resets tool-call history', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  const toolInput = { endLine: 28, filePath: '/repo/LEARNINGS.md', startLine: 28 };
  fs.writeFileSync(
    transcript,
    [
      { type: 'tool.execution_start', data: { toolName: 'read_file', arguments: toolInput } },
      { type: 'user.message', data: { content: 'A new request.' } }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: toolInput,
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: canonicalizes tool argument key order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      type: 'tool.execution_start',
      data: {
        toolName: 'read_file',
        arguments: { filePath: '/repo/LEARNINGS.md', startLine: 28, endLine: 28 }
      }
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { endLine: 28, startLine: 28, filePath: '/repo/LEARNINGS.md' },
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-call tool cycle/);
});

test('repeated-message guard: blocks a repeated two-call tool cycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  const firstCall = { endLine: 28, filePath: '/repo/LEARNINGS.md', startLine: 28 };
  const secondCall = { includePattern: 'LEARNINGS.md', query: 'repeated reads' };
  fs.writeFileSync(
    transcript,
    [
      { type: 'tool.execution_start', data: { toolName: 'read_file', arguments: firstCall } },
      { type: 'tool.execution_start', data: { toolName: 'grep_search', arguments: secondCall } },
      { type: 'tool.execution_start', data: { toolName: 'read_file', arguments: firstCall } }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'grep_search',
      tool_input: secondCall,
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 2-call tool cycle/);
});

test('repeated-message guard: interrupts a repeated three-message cycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      messages: [
        { role: 'assistant', content: 'First.' },
        { role: 'assistant', content: 'Second.' },
        { role: 'assistant', content: 'Third.' },
        { role: 'assistant', content: 'First.' },
        { role: 'assistant', content: 'Second.' },
        { role: 'assistant', content: 'Third.' }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    { hook_event_name: 'PreToolUse', tool_name: 'read_file', transcript_path: transcript },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 3-message agent cycle/);
});

test('repeated-message guard: a user message breaks the assistant cycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      messages: [
        { role: 'assistant', content: 'Same answer.' },
        { role: 'user', content: 'A separate prompt.' },
        { role: 'assistant', content: 'Same answer.' }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    { hook_event_name: 'PreToolUse', tool_name: 'read_file', transcript_path: transcript },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: VS Code user.message events reset assistant history', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      { type: 'assistant.message', data: { content: 'Same answer.' } },
      { type: 'user.message', data: { content: 'A separate prompt.' } },
      { type: 'assistant.message', data: { content: 'Same answer.' } }
    ].map(JSON.stringify).join('\n')
  );

  const response = runHook(
    repeatHook,
    { hook_event_name: 'PreToolUse', tool_name: 'read_file', transcript_path: transcript },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: blocks a no-tool loop once at Stop and allows the retry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      { type: 'assistant.message', data: { content: 'I apologize for the repeated attempts.' } },
      { type: 'assistant.message', data: { content: 'Let me provide a single clean summary.' } },
      { type: 'assistant.message', data: { content: 'I apologize for the repeated attempts.' } },
      { type: 'assistant.message', data: { content: 'Let me provide a single clean summary.' } }
    ].map(JSON.stringify).join('\n')
  );

  const unknownState = runHook(
    repeatHook,
    { hook_event_name: 'Stop', transcript_path: transcript },
    root,
    root
  );
  assert.deepEqual(unknownState, { continue: true });

  const blocked = runHook(
    repeatHook,
    { hook_event_name: 'Stop', stop_hook_active: false, transcript_path: transcript },
    root,
    root
  );
  assert.equal(blocked.hookSpecificOutput.decision, 'block');
  assert.match(blocked.hookSpecificOutput.reason, /concise, clean summary/);

  const retry = runHook(
    repeatHook,
    { hook_event_name: 'Stop', stop_hook_active: true, transcript_path: transcript },
    root,
    root
  );
  assert.equal(retry.continue, true);
});

test('repeated-message guard: parses adjacent JSON records without newline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      JSON.stringify({ role: 'assistant', content: 'Repeated answer.' }),
      JSON.stringify({ role: 'tool', content: 'tool result' }),
      JSON.stringify({ role: 'assistant', content: 'Repeated answer.' })
    ].join('')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-message agent cycle/);
});

test('repeated-message guard: finds messages nested in transcript event wrappers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      events: [
        {
          type: 'assistant_message',
          data: { author: { name: 'assistant' }, body: { parts: [{ text: 'Same response.' }] } }
        },
        {
          type: 'chat_message',
          data: { speaker: 'copilot', value: [{ text: 'Same response.' }] }
        }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-message agent cycle/);
});

test('repeated-message guard: ignores assistant-shaped data inside tool events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      events: [
        {
          type: 'tool_result',
          data: { role: 'assistant', content: 'Same response.' }
        },
        {
          type: 'tool_result',
          data: { role: 'assistant', content: 'Same response.' }
        }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: reads request-response transcript records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      requests: [
        {
          message: 'First prompt.',
          response: [{ kind: 'text', value: 'First response.' }]
        },
        {
          message: 'Second prompt.',
          response: [{ kind: 'text', value: 'Second response.' }]
        }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: ignores historical repeats followed by new response', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      messages: [
        { role: 'assistant', content: 'Repeated text.' },
        { role: 'assistant', content: 'Repeated text.' },
        { role: 'assistant', content: [{ type: 'text', text: 'A new answer.' }] }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: is registered at PreToolUse and Stop', () => {
  const config = JSON.parse(fs.readFileSync(repeatHookConfig, 'utf8'));
  assert.equal(config.hooks.PreToolUse.length, 1);
  assert.equal(config.hooks.Stop.length, 1);
  assert.match(config.hooks.PreToolUse[0].command, /detect-repeated-message\.cjs$/);
  assert.match(config.hooks.Stop[0].command, /detect-repeated-message\.cjs$/);
});

// ============================================================================
// Testing Gaps - Edge Cases
// ============================================================================

test('repeated-message guard: empty transcript returns continue: true', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcript, '');

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: { messages: [...] } format with identical consecutive messages triggers block', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      messages: [
        { role: 'assistant', content: 'Identical response.' },
        { role: 'assistant', content: 'Identical response.' }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /identical|repeating|consecutive/i);
});

test('repeated-message guard: transcript with only user messages returns continue: true', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      JSON.stringify({ role: 'user', content: 'First question.' }),
      JSON.stringify({ role: 'user', content: 'Second question.' })
    ].join('\n')
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: transcript with single assistant message returns continue: true', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    JSON.stringify({ role: 'assistant', content: 'Single answer.' })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});

test('repeated-message guard: missing transcript_path returns continue: true', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file'
      // No transcript_path
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  // No systemMessage - graceful degradation is silent
});

test('repeated-message guard: malformed JSON transcript returns continue: true', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcript, '{not valid json\n{also not valid}');

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, true);
  // No systemMessage - graceful degradation is silent
});

test('repeated-message guard: various role name variations are recognized', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      events: [
        { role: 'bot', content: 'Repeated bot response.' },
        { role: 'bot', content: 'Repeated bot response.' }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-message agent cycle/);
});

test('repeated-message guard: adjacent JSON with nested objects parses correctly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.jsonl');
  // Adjacent JSON records with nested content arrays
  fs.writeFileSync(
    transcript,
    JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Nested repeat.' }] }) +
    JSON.stringify({ role: 'tool', content: 'result' }) +
    JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Nested repeat.' }] })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  assert.equal(response.continue, false);
  assert.match(response.stopReason, /repeated 1-message agent cycle/);
});

test('repeated-message guard: { transcript: [...] } format is handled', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repeat-hook-'));
  const transcript = path.join(root, 'transcript.json');
  fs.writeFileSync(
    transcript,
    JSON.stringify({
      transcript: [
        { role: 'assistant', content: 'Transcript key response.' },
        { role: 'assistant', content: 'Transcript key response.' }
      ]
    })
  );

  const response = runHook(
    repeatHook,
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      transcript_path: transcript
    },
    root,
    root
  );
  // The hook does NOT handle { transcript: [...] } — only events, messages, requests
  assert.equal(response.continue, true);
  assert.equal(response.stopReason, undefined);
});
