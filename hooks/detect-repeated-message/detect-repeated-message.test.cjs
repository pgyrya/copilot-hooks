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
  assert.match(response.stopReason, /identical consecutive agent message/);
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
  assert.match(response.stopReason, /identical consecutive agent message/);
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
  assert.match(response.stopReason, /identical consecutive agent message/);
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

test('repeated-message guard: is registered at PreToolUse, not at Stop', () => {
  const config = JSON.parse(fs.readFileSync(repeatHookConfig, 'utf8'));
  assert.equal(config.hooks.PreToolUse.length, 1);
  assert.equal(config.hooks.Stop, undefined);
  assert.match(config.hooks.PreToolUse[0].command, /detect-repeated-message\.cjs$/);
  assert.match(
    runHook(repeatHook, { hook_event_name: 'Stop' }, os.tmpdir(), os.tmpdir())
      .systemMessage,
    /configured to run at PreToolUse/
  );
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
  assert.match(response.stopReason, /identical consecutive agent message/);
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
  assert.match(response.stopReason, /identical consecutive agent message/);
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
