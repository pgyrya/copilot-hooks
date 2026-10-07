const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');

const hooksDirectory = __dirname;
const completionHook = path.join(hooksDirectory, 'verify-completion.cjs');

// Helper to compute state file path (matches verify-completion.cjs logic)
function getStatePath(stateDir, sessionId) {
  const hash = crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return path.join(stateDir, `completion-${hash}.json`);
}

// Arbitrary value exceeding REVIEW_CYCLES_PER_USER_MESSAGE (5) for invalid state tests
const INVALID_CYCLE_VALUE = 99;

function runHook(script, event, home, cwd, extraEnv = {}, customSessionId = null) {
  const result = spawnSync(
    process.execPath,
    [script],
    {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        VSCODE_AGENT_SESSION_ID: customSessionId || 'hook-test-session',
        ...extraEnv
      },
      input: JSON.stringify(event),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// ============================================================================
// verify-completion.cjs Tests
// ============================================================================

describe('Cycle lifecycle', () => {
  test('completion review: UserPromptSubmit initializes cycle to 0', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-1',
    prompt: 'Test prompt'
  }, home, cwd);

  assert.equal(response.continue, true);
});

test('completion review: increments cycles 1 through max', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  const completionSource = fs.readFileSync(completionHook, 'utf8');
  const configuredCycles = completionSource.match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const event = {
    hook_event_name: 'Stop',
    session_id: 'test-session-2',
    cwd
  };

  // Initialize with UserPromptSubmit
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-2',
    prompt: 'Test prompt'
  }, home, cwd);

  // Increment through all cycles
  for (let cycle = 1; cycle <= Number(configuredCycles[1]); cycle += 1) {
    const response = runHook(completionHook, event, home, cwd);
    assert.equal(response.hookSpecificOutput.hookEventName, 'Stop');
    assert.equal(response.hookSpecificOutput.decision, cycle <= Number(configuredCycles[1]) ? 'block' : 'allow');
    assert.match(
      response.hookSpecificOutput.reason,
      new RegExp(`CYCLE ${cycle}/${configuredCycles[1]}`)
    );
    // Assert that the reason contains a review instruction (decoupled from specific prompt text)
    assert.match(response.hookSpecificOutput.reason, /review|general practices/i);
  }
});

test('completion review: same prompt during cycle does not reset', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Initialize cycle
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-3',
    prompt: 'Test prompt'
  }, home, cwd);

  // Increment to cycle 1 (configurable)
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'test-session-3',
    cwd
  }, home, cwd);

  // Resubmit same prompt - should not reset
  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-3',
    prompt: 'Test prompt'
  }, home, cwd);

  assert.deepEqual(response, { continue: true });
});

test('completion review: does not reset after max cycles completes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  const event = {
    hook_event_name: 'Stop',
    session_id: 'test-session-4',
    cwd
  };

  // Complete all cycles
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-4',
    prompt: 'Test prompt'
  }, home, cwd);

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    runHook(completionHook, event, home, cwd);
  }

  // Resubmit same prompt after max cycles - should NOT reset
  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-4',
    prompt: 'Test prompt'
  }, home, cwd);

  assert.deepEqual(response, { continue: true });

  // Next Stop should return continue: true (cycle already at max)
  const nextStop = runHook(completionHook, event, home, cwd);
  assert.equal(nextStop.continue, true);
  assert.equal(nextStop.hookSpecificOutput, undefined,
    'hookSpecificOutput should be undefined when cycle >= maxCycles');
});

test('completion review: boundary: Stop after max cycles returns continue without hookSpecificOutput', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  const event = {
    hook_event_name: 'Stop',
    session_id: 'test-session-5',
    cwd
  };

  // Complete all cycles
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-5',
    prompt: 'Test prompt'
  }, home, cwd);

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    runHook(completionHook, event, home, cwd);
  }

  // Boundary-value test: even if another Stop event arrives beyond max cycles,
  // it should still return continue: true without hookSpecificOutput.
  const response = runHook(completionHook, event, home, cwd);
  assert.equal(response.continue, true);
  assert.equal(response.hookSpecificOutput, undefined,
    'hookSpecificOutput should be undefined beyond max cycles (boundary test)');
});

test('completion review: different prompt preserves incomplete cycle, next Stop increments', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  const event = {
    hook_event_name: 'Stop',
    session_id: 'test-session-6',
    cwd
  };

  // Submit first prompt and increment to cycle 1 (incomplete)
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-6',
    prompt: 'First prompt'
  }, home, cwd);
  runHook(completionHook, event, home, cwd);

  // Submit different prompt while cycle is incomplete — should preserve cycle
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-6',
    prompt: 'Different prompt'
  }, home, cwd);

  const response = runHook(completionHook, event, home, cwd);
  assert.equal(response.hookSpecificOutput.hookEventName, 'Stop');
  // When maxCycles=1, cycle 2 > maxCycles → allow; when maxCycles>=2, cycle 2 <= maxCycles → block
  assert.equal(response.hookSpecificOutput.decision, maxCycles >= 2 ? 'block' : 'allow',
    `Cycle 2 decision depends on maxCycles=${maxCycles}`);
  assert.match(response.hookSpecificOutput.reason, new RegExp(`CYCLE 2\\/${maxCycles}`));
});

test('completion review: different prompt updates prompt_hash in state file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Step 1: Submit prompt A
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'state-file-assertion-session',
    prompt: 'Prompt A'
  }, home, cwd);

  // Step 2: Stop → cycle 1
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'state-file-assertion-session',
    cwd
  }, home, cwd);

  // Step 3: Submit prompt B (different) — should update prompt_hash
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'state-file-assertion-session',
    prompt: 'Prompt B'
  }, home, cwd);

  // Verify state file: cycle should be 1, prompt_hash should be for Prompt B
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  
  assert.equal(state.cycle, 1, 'Cycle should be preserved at 1');
  const promptBHash = require('crypto').createHash('sha256').update('Prompt B').digest('hex');
  assert.equal(state.prompt_hash, promptBHash, 'prompt_hash should be updated to Prompt B');
});

test('completion review: prompt A completes max cycles → prompt B starts at cycle 1', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  const stopEvent = {
    hook_event_name: 'Stop',
    session_id: 'test-session-7',
    cwd
  };

  // Submit and complete prompt A through max cycles
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-7',
    prompt: 'Prompt A'
  }, home, cwd);

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const response = runHook(completionHook, stopEvent, home, cwd);
    assert.equal(response.hookSpecificOutput.decision, cycle <= maxCycles ? 'block' : 'allow');
  }

  // Submit prompt B after prompt A completed — should reset cycle to 0
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'test-session-7',
    prompt: 'Prompt B'
  }, home, cwd);

  const response = runHook(completionHook, stopEvent, home, cwd);
  assert.equal(response.hookSpecificOutput.hookEventName, 'Stop');
  assert.equal(response.hookSpecificOutput.decision, 'block'); // cycle 1 → block
  assert.match(response.hookSpecificOutput.reason, new RegExp(`CYCLE 1\\/${maxCycles}`));
});

test('completion review: recovers from corrupted session state (invalid JSON)', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const promptEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'corrupt-state-session',
    prompt: 'Continue with a clean state'
  };
  runHook(completionHook, promptEvent, home, cwd);

  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  fs.writeFileSync(stateFile, '{not valid json');

  const resetResponse = runHook(completionHook, promptEvent, home, cwd);
  assert.equal(resetResponse.continue, true);
  assert.match(resetResponse.systemMessage, /reset invalid state/);

  const reviewResponse = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: 'corrupt-state-session',
      cwd
    },
    home,
    cwd
  );
  assert.match(reviewResponse.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
});

test('completion review: recovers from out-of-range cycle value', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const promptEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'out-of-range-session',
    prompt: 'Test prompt'
  };
  runHook(completionHook, promptEvent, home, cwd);

  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      session_id: 'out-of-range-session',
      cycle: Number.MAX_SAFE_INTEGER
    })
  );

  const outOfRangeResponse = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: 'out-of-range-session',
      cwd
    },
    home,
    cwd
  );
  assert.match(outOfRangeResponse.systemMessage, /reset invalid state/);
  assert.match(outOfRangeResponse.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
});

test('completion review: recovers from negative cycle value', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const promptEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'negative-cycle-session',
    prompt: 'Test prompt'
  };
  runHook(completionHook, promptEvent, home, cwd);

  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      session_id: 'negative-cycle-session',
      cycle: -1
    })
  );

  const response = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: 'negative-cycle-session',
      cwd
    },
    home,
    cwd
  );
  assert.match(response.systemMessage, /reset invalid state/);
  assert.match(response.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
});

test('completion review: recovers from non-integer cycle value', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const promptEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'non-integer-cycle-session',
    prompt: 'Test prompt'
  };
  runHook(completionHook, promptEvent, home, cwd);

  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      session_id: 'non-integer-cycle-session',
      cycle: 1.5
    })
  );

  const response = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: 'non-integer-cycle-session',
      cwd
    },
    home,
    cwd
  );
  assert.match(response.systemMessage, /reset invalid state/);
  assert.match(response.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
});

test('completion review: recovers from missing cycle field', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const promptEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'missing-cycle-session',
    prompt: 'Test prompt'
  };
  runHook(completionHook, promptEvent, home, cwd);

  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      session_id: 'missing-cycle-session'
      // cycle field is missing
    })
  );

  const response = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: 'missing-cycle-session',
      cwd
    },
    home,
    cwd
  );
  assert.match(response.systemMessage, /reset invalid state/);
  assert.match(response.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
});

test('completion review: Stop event without prompt field increments cycle and preserves prompt_hash', (t) => {
  // Regression test: Stop handler must increment cycle even when no prompt field is present.
  // This was the original double-block bug — when task_complete was called twice,
  // the second Stop had no prompt field and the cycle was not incremented.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const stateDir = path.join(home, '.copilot', 'hooks', '.state');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Seed state with cycle 1 (below max so Stop can increment)
  const seededCycle = 1;
  const sessionId = 'abcdef1234567890';
  const stateFile = getStatePath(stateDir, sessionId);
  fs.writeFileSync(stateFile, JSON.stringify({
    session_id: sessionId,
    cycle: seededCycle,
    prompt_hash: 'abc123',
    prompt_submitted_at: new Date(Date.now() - 60000).toISOString(),
    updated_at: new Date(Date.now() - 30000).toISOString()
  }));

  // Send Stop event WITHOUT a prompt field (this was the original bug)
  const response = runHook(
    completionHook,
    {
      hook_event_name: 'Stop',
      session_id: sessionId,
      cwd
    },
    home,
    cwd
  );
  assert.match(response.hookSpecificOutput.reason, new RegExp(`CYCLE 2\\/${maxCycles}`));

  // Verify state was updated to seeded cycle + 1
  const updatedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(updatedState.cycle, seededCycle + 1);
});
}); // end Bug regression tests

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  test('completion review: UserPromptSubmit without prompt field sets promptHash to null', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'no-prompt-session'
  }, home, cwd);

  assert.equal(response.continue, true);
  
  // Verify state was created with prompt_hash: null
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.prompt_hash, null);
});

test('completion review: missing instructions file returns continue: true with systemMessage', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  // Don't create the instructions file
  fs.mkdirSync(cwd, { recursive: true });

  // Initialize state first
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'no-instructions-session',
    prompt: 'Test prompt'
  }, home, cwd);

  const response = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'no-instructions-session',
    cwd
  }, home, cwd);

  assert.equal(response.continue, true);
  assert.ok(response.systemMessage);
});

test('completion review: empty instructions file returns continue: true with systemMessage', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, '');

  // Initialize state first
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'empty-instructions-session',
    prompt: 'Test prompt'
  }, home, cwd);

  const response = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'empty-instructions-session',
    cwd
  }, home, cwd);

  assert.equal(response.continue, true);
  assert.ok(response.systemMessage);
});

test('completion review: missing review prompt file returns continue: true with systemMessage', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');
  // Don't create the review prompt file — use a non-existent temp path

  // Modify the hook to point to a non-existent review prompt file
  const completionSource = fs.readFileSync(path.join(__dirname, 'verify-completion.cjs'), 'utf8');
  const missingReviewPrompt = path.join(root, 'non-existent-review-prompt.md');
  const modifiedSource = completionSource.replace(
    "path.join(__dirname, 'completion-review-prompt.md')",
    `"${missingReviewPrompt}"`
  );
  const modifiedHook = path.join(root, 'verify-completion-modified.cjs');
  fs.writeFileSync(modifiedHook, modifiedSource);

  // Initialize state first
  runHook(modifiedHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'no-review-prompt-session',
    prompt: 'Test prompt'
  }, home, cwd);

  const response = runHook(modifiedHook, {
    hook_event_name: 'Stop',
    session_id: 'no-review-prompt-session',
    cwd
  }, home, cwd);

  assert.equal(response.continue, true);
  assert.ok(response.systemMessage);
});

test('completion review: empty review prompt file returns continue: true with systemMessage', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  const reviewPromptFile = path.join(root, 'completion-review-prompt.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');
  fs.writeFileSync(reviewPromptFile, '');

  // Temporarily override the REVIEW_PROMPT_FILE path
  const completionSource = fs.readFileSync(path.join(__dirname, 'verify-completion.cjs'), 'utf8');
  const modifiedSource = completionSource.replace(
    "path.join(__dirname, 'completion-review-prompt.md')",
    `"${reviewPromptFile}"`
  );
  const modifiedHook = path.join(root, 'verify-completion-modified.cjs');
  fs.writeFileSync(modifiedHook, modifiedSource);

  // Initialize state first
  runHook(modifiedHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'empty-review-prompt-session',
    prompt: 'Test prompt'
  }, home, cwd);

  const response = runHook(modifiedHook, {
    hook_event_name: 'Stop',
    session_id: 'empty-review-prompt-session',
    cwd
  }, home, cwd);

  assert.equal(response.continue, true);
  assert.ok(response.systemMessage);
});

test('completion review: both files missing returns continue: true with systemMessage', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  // Don't create the instructions file
  // Don't create the review prompt file (use non-existent path in modified hook)
  fs.mkdirSync(cwd, { recursive: true });

  // Modify the hook to point to a non-existent review prompt file
  const completionSource = fs.readFileSync(path.join(__dirname, 'verify-completion.cjs'), 'utf8');
  const missingReviewPrompt = path.join(root, 'non-existent-review-prompt.md');
  const modifiedSource = completionSource.replace(
    "path.join(__dirname, 'completion-review-prompt.md')",
    `"${missingReviewPrompt}"`
  );
  const modifiedHook = path.join(root, 'verify-completion-modified.cjs');
  fs.writeFileSync(modifiedHook, modifiedSource);

  // Initialize state first (will fail on missing instructions file)
  runHook(modifiedHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'both-files-missing-session',
    prompt: 'Test prompt'
  }, home, cwd);

  const response = runHook(modifiedHook, {
    hook_event_name: 'Stop',
    session_id: 'both-files-missing-session',
    cwd
  }, home, cwd);

  assert.equal(response.continue, true);
  assert.ok(response.systemMessage, 'Should have systemMessage when both files are missing');
  // The systemMessage should mention the first missing file (instructions)
  assert.match(response.systemMessage, /copilot-instructions\.md/i,
    'systemMessage should reference the missing instructions file');
});

test('completion review: different session does not affect existing state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Initialize state with session-1
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-1',
    prompt: 'Test prompt'
  }, home, cwd);

  // Send two Stop events — cycle should increment to min(2, maxCycles)
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'session-1',
    cwd
  }, home, cwd);
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'session-1',
    cwd
  }, home, cwd);

  // Submit with different session ID — should NOT affect session-1's state
  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-2',
    prompt: 'Test prompt'
  }, home, cwd);

  assert.equal(response.continue, true);
  
  // Verify both state files exist independently
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFiles = fs.readdirSync(stateDirectory).filter(name => name.startsWith('completion-'));
  assert.equal(stateFiles.length, 2, 'Should have 2 independent state files');
  
  // Read both state files and verify they are independent
  const states = stateFiles.map(f => JSON.parse(fs.readFileSync(path.join(stateDirectory, f), 'utf8')));
  const session1State = states.find(s => s.session_id === 'session-1');
  const session2State = states.find(s => s.session_id === 'session-2');
  
  assert.equal(session1State.cycle, Math.min(2, maxCycles), 'Session-1 should be at min(2, maxCycles) after two Stop events');
  assert.equal(session2State.cycle, 0, 'Session-2 should start at cycle 0');
});

test('completion review: isolated sessions maintain independent state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Initialize session A
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'isolated-session-A',
    prompt: 'Session A prompt'
  }, home, cwd);

  // Initialize session B
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'isolated-session-B',
    prompt: 'Session B prompt'
  }, home, cwd);

  // Increment session A to cycle 1 (below max)
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'isolated-session-A',
    cwd
  }, home, cwd);

  // Session B should still be at cycle 0 (just initialized)
  const bResponse = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'isolated-session-B',
    cwd
  }, home, cwd);
  assert.equal(bResponse.hookSpecificOutput.decision, 'block'); // cycle 1 → block
  assert.match(bResponse.hookSpecificOutput.reason, new RegExp(`CYCLE 1\\/${maxCycles}`));

  // Session A should be at cycle 1 (independent from B)
  const aResponse = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'isolated-session-A',
    cwd
  }, home, cwd);
  // Session A's decision depends on maxCycles: if maxCycles >= 2, cycle 2 → block;
  // if maxCycles = 1, cycle 2 > maxCycles → allow. The key assertion is independence.
  const expectedDecision = maxCycles >= 2 ? 'block' : 'allow';
  assert.equal(aResponse.hookSpecificOutput.decision, expectedDecision,
    `Session A should be ${expectedDecision} at cycle 2 (independent from Session B)`);

  // Verify both state files exist on disk
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFiles = fs.readdirSync(stateDirectory).filter(name => name.startsWith('completion-'));
  assert.equal(stateFiles.length, 2, 'Should have 2 independent state files');
});

test('completion review: malformed JSON input returns continue: true with error message', (t) => {
  // Test for untested catch block in main handler
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Spawn the hook with malformed JSON input
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    [completionHook],
    {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        VSCODE_AGENT_SESSION_ID: 'test-session'
      },
      input: '{not valid json at all',
      encoding: 'utf8'
    }
  );

  // Should handle gracefully with continue: true and error message
  const response = JSON.parse(result.stdout);
  assert.equal(response.continue, true,
    'Malformed JSON should still return continue: true');
  assert.ok(response.systemMessage.includes('Completion review hook error'),
    'Should include error message in systemMessage');
});

test('completion review: Stop event without prior UserPromptSubmit initializes cycle to 1', (t) => {
  // Tests "cold start" behavior — Stop as the first event (no prior UserPromptSubmit)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Send Stop as the very first event — no UserPromptSubmit before it
  const response = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'cold-start-session',
    cwd
  }, home, cwd);

  // Should initialize state with cycle=1 and block
  assert.equal(response.hookSpecificOutput.hookEventName, 'Stop');
  assert.equal(response.hookSpecificOutput.decision, 'block');
  assert.match(response.hookSpecificOutput.reason, /CYCLE 1\/\d+/);
  
  // Verify state was created with cycle: 1
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.cycle, 1, 'Cold start Stop should initialize cycle to 1');
});

test('completion review: consecutive UserPromptSubmit events update prompt_hash without incrementing cycle', (t) => {
  // Tests UserPromptSubmit → UserPromptSubmit sequence (consecutive prompts without Stop)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // First UserPromptSubmit
  const response1 = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'consecutive-prompt-session',
    prompt: 'First prompt'
  }, home, cwd);
  assert.equal(response1.continue, true);
  
  // Second UserPromptSubmit (different prompt, same session)
  const response2 = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'consecutive-prompt-session',
    prompt: 'Second prompt'
  }, home, cwd);
  assert.equal(response2.continue, true);
  
  // Verify state has cycle=0 and prompt_hash updated to second prompt
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.cycle, 0, 'Consecutive UserPromptSubmit should keep cycle at 0');
  assert.ok(state.prompt_hash, 'State should have prompt_hash after second prompt');
  assert.equal(state.prompt_hash.length, 64, 'prompt_hash should be 64 hex chars (full SHA256)');
});

test('completion review: empty string prompt creates distinct prompt_hash from missing prompt', (t) => {
  // Tests that empty string prompt ("") produces a different hash than missing prompt field
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // UserPromptSubmit with empty string prompt
  const response1 = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'empty-prompt-session',
    prompt: ''
  }, home, cwd);
  assert.equal(response1.continue, true);
  
  // Verify state has prompt_hash (not null) — empty string produces sha256("")
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(state.prompt_hash, 'Empty string prompt should create prompt_hash (not null)');
  assert.notEqual(state.prompt_hash, null, 'Empty string prompt should not have null prompt_hash');
  
  // Compare with missing prompt field — should have different prompt_hash (null vs sha256(""))
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root2, { recursive: true, force: true }));
  const home2 = path.join(root2, 'home');
  const cwd2 = path.join(root2, 'workspace');
  const instructionFile2 = path.join(home2, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile2), { recursive: true });
  fs.mkdirSync(cwd2, { recursive: true });
  fs.writeFileSync(instructionFile2, 'Follow the general practices.');

  const response2 = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'missing-prompt-session'
    // No prompt field at all
  }, home2, cwd2);
  assert.equal(response2.continue, true);
  
  const stateDirectory2 = path.join(home2, '.copilot', 'hooks', '.state');
  const stateFile2 = path.join(
    stateDirectory2,
    fs.readdirSync(stateDirectory2).find(name => name.startsWith('completion-'))
  );
  const state2 = JSON.parse(fs.readFileSync(stateFile2, 'utf8'));
  assert.equal(state2.prompt_hash, null, 'Missing prompt field should have null prompt_hash');
});
}); // end Edge cases

// ============================================================================
// Bug Regression Tests: Double-Block Scenario
// ============================================================================

describe('Bug regression tests', () => {
  test('completion review: stateWarning included in block response when handleStop detects invalid state', (t) => {
    // Tests the handleStop invalid state path — when state exists but cycle exceeds max,
    // handleStop sets stateWarning and includes it via spread in the block return.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    const cwd = path.join(root, 'workspace');
    const stateDir = path.join(home, '.copilot', 'hooks', '.state');
    const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(instructionFile, 'Follow the general practices.');

    // Manually create a state file with invalid cycle (exceeds maxCycles=5)
    const sessionId = 'state-warning-session';
    const statePath = getStatePath(stateDir, sessionId);
    const invalidState = {
      session_id: sessionId,
      cycle: INVALID_CYCLE_VALUE, // Invalid: exceeds REVIEW_CYCLES_PER_USER_MESSAGE (5)
      prompt_hash: 'some-hash',
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(statePath, JSON.stringify(invalidState));

    // Send Stop event — handleStop should detect invalid state, reset, and include stateWarning
    const response = runHook(completionHook, {
      hook_event_name: 'Stop',
      session_id: sessionId,
      cwd
    }, home, cwd);

    // Should block with stateWarning in the response
    assert.ok(response.hookSpecificOutput, 'Should have hookSpecificOutput');
    assert.equal(response.hookSpecificOutput.decision, 'block', 'Should block');
    assert.ok(response.systemMessage, 'Should include systemMessage (stateWarning)');
    assert.match(response.systemMessage, /reset invalid state/i,
      'systemMessage should mention invalid state reset');
    assert.ok(
      response.systemMessage.includes(`cycle ${INVALID_CYCLE_VALUE}`),
      `systemMessage should reference cycle ${INVALID_CYCLE_VALUE} out of range`
    );
  });

  test('completion review: different prompt preserves incomplete cycle through multiple stops and exhaustion', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Step 1: UserPromptSubmit with prompt A
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'double-block-session',
    prompt: 'Task A: Fix the login bug'
  }, home, cwd);

  // Step 2: Stop → cycle 1, block
  const stop1 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'double-block-session',
    cwd
  }, home, cwd);
  assert.equal(stop1.hookSpecificOutput.decision, 'block');
  assert.match(stop1.hookSpecificOutput.reason, /CYCLE 1\/\d+/);

  // Step 3: UserPromptSubmit with prompt B (different prompt) — preserves cycle at 1
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'double-block-session',
    prompt: 'Task B: Update the documentation'
  }, home, cwd);

  // Step 4: Stop → should be cycle 2 (preserved from 1)
  const stop2 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'double-block-session',
    cwd
  }, home, cwd);
  // With the new design, different prompt preserves incomplete cycle, so Stop increments to cycle 2
  assert.equal(stop2.hookSpecificOutput.decision, maxCycles >= 2 ? 'block' : 'allow',
    `Different prompt should preserve incomplete cycle at cycle 2 (decision depends on maxCycles=${maxCycles})`);

  // Step 5: Stop → should be cycle 3 (incremented from 2)
  const stop3 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'double-block-session',
    cwd
  }, home, cwd);

  if (maxCycles >= 3) {
    assert.equal(stop3.hookSpecificOutput.decision, 'block',
      'Should block at cycle 3 (cycle <= maxCycles)');

    // Continue incrementing until we reach allow
    let current = stop3;
    let stopNum = 3;
    while (current.hookSpecificOutput && current.hookSpecificOutput.decision === 'block') {
      stopNum++;
      current = runHook(completionHook, {
        hook_event_name: 'Stop',
        session_id: 'double-block-session',
        cwd
      }, home, cwd);
    }
    assert.equal(current.hookSpecificOutput, undefined,
      `Should allow completion at stop ${stopNum} when cycle >= maxCycles (no hookSpecificOutput)`);
    assert.equal(current.continue, true,
      'Should return continue: true when at max cycles');
  } else {
    // maxCycles < 3, stop3 should already allow
    assert.equal(stop3.hookSpecificOutput, undefined,
      'Should allow completion when cycle >= maxCycles (no hookSpecificOutput)');
    assert.equal(stop3.continue, true,
      'Should return continue: true when at max cycles');
  }
});

test('completion review: different prompt preserves cycle through exhaustion, re-submitting original prompt resets', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Step 1: UserPromptSubmit with prompt A
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'same-prompt-regression-session',
    prompt: 'Task A: Fix the login bug'
  }, home, cwd);

  // Step 2: Stop → cycle 1, block
  const stop1 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'same-prompt-regression-session',
    cwd
  }, home, cwd);
  assert.equal(stop1.hookSpecificOutput.decision, 'block');

  // Step 3: UserPromptSubmit with prompt B (different prompt) — preserves cycle at 1
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'same-prompt-regression-session',
    prompt: 'Task B: Update the documentation'
  }, home, cwd);

  // Step 4: Stop → cycle 2 (preserved)
  const stop2 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'same-prompt-regression-session',
    cwd
  }, home, cwd);
  assert.equal(stop2.hookSpecificOutput.decision, maxCycles >= 2 ? 'block' : 'allow',
    `Different prompt should preserve incomplete cycle at cycle 2 (decision depends on maxCycles=${maxCycles})`);

  // Step 5: Stop → cycle 3 (incremented from 2)
  const stop3 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'same-prompt-regression-session',
    cwd
  }, home, cwd);

  if (maxCycles >= 3) {
    assert.equal(stop3.hookSpecificOutput.decision, 'block',
      'Should block at cycle 3 (cycle <= maxCycles)');

    // Continue incrementing until we reach allow
    let current = stop3;
    let stopNum = 3;
    while (current.hookSpecificOutput && current.hookSpecificOutput.decision === 'block') {
      stopNum++;
      current = runHook(completionHook, {
        hook_event_name: 'Stop',
        session_id: 'same-prompt-regression-session',
        cwd
      }, home, cwd);
    }
    assert.equal(current.hookSpecificOutput, undefined,
      `Should allow completion at stop ${stopNum} when cycle >= maxCycles (no hookSpecificOutput)`);
    assert.equal(current.continue, true,
      'Should return continue: true when at max cycles');
  } else {
    // maxCycles < 3, stop3 should already allow
    assert.equal(stop3.hookSpecificOutput, undefined,
      'Should allow completion when cycle >= maxCycles (no hookSpecificOutput)');
    assert.equal(stop3.continue, true,
      'Should return continue: true when at max cycles');
  }

  // Step 7: UserPromptSubmit with prompt A (original prompt again) — resets cycle to 0 (different from B, and B completed)
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'same-prompt-regression-session',
    prompt: 'Task A: Fix the login bug'
  }, home, cwd);

  // Step 8: Stop → should be cycle 1 (new cycle for prompt A), block
  const stop5 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'same-prompt-regression-session',
    cwd
  }, home, cwd);
  // This tests that prompt A gets a fresh cycle when re-submitted after prompt B completed
  assert.equal(stop5.hookSpecificOutput.decision, 'block',
    'Re-submitting prompt A after B completed should start a new cycle');
});

test('completion review: Session B Stop does not corrupt Session A state', (t) => {
  // Regression test: verifies that when Session B's Stop resets its own state
  // (on session mismatch), Session A's state file is preserved untouched.
  // This complements the "Stop handler resets state on session mismatch" test
  // which only verified the new session's state, not the original session's.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Session A: initialize and increment to cycle 1
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'cross-session-a',
    prompt: 'Session A prompt'
  }, home, cwd);
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'cross-session-a',
    cwd
  }, home, cwd);

  // Capture Session A's state (state file is keyed by SHA256 hash of session_id)
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFiles = fs.readdirSync(stateDirectory).filter(n => n.startsWith('completion-'));
  assert.equal(stateFiles.length, 1, 'Should have exactly one state file for Session A');
  const sessionAStateBefore = JSON.parse(fs.readFileSync(path.join(stateDirectory, stateFiles[0]), 'utf8'));
  assert.equal(sessionAStateBefore.session_id, 'cross-session-a');
  assert.equal(sessionAStateBefore.cycle, 1);

  // Session B: Stop with different session_id — should reset Session B's state
  // but NOT touch Session A's state file
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'cross-session-b',
    cwd
  }, home, cwd);

  // Verify Session A's state is unchanged
  const stateFilesAfter = fs.readdirSync(stateDirectory).filter(n => n.startsWith('completion-'));
  // Should still have exactly 2 state files (Session A + Session B)
  assert.equal(stateFilesAfter.length, 2, 'Should have two state files after Session B Stop');
  
  // Find Session A's state file by session_id
  const sessionAStateAfter = JSON.parse(
    fs.readFileSync(path.join(stateDirectory, stateFilesAfter.find(f => {
      const s = JSON.parse(fs.readFileSync(path.join(stateDirectory, f), 'utf8'));
      return s.session_id === 'cross-session-a';
    })), 'utf8')
  );
  assert.equal(sessionAStateAfter.session_id, 'cross-session-a',
    'Session A session_id should be unchanged');
  assert.equal(sessionAStateAfter.cycle, 1,
    'Session A cycle should be unchanged after Session B Stop');
  assert.equal(sessionAStateAfter.prompt_hash, sessionAStateBefore.prompt_hash,
    'Session A prompt_hash should be unchanged');
});
}); // end Bug regression tests

// ============================================================================
// Hook Configuration Validation
// ============================================================================

describe('Hook configuration', () => {
  test('completion review: verify-completion.json references existing script', (t) => {
  const hooksRoot = path.resolve(__dirname, '..');
  t.after(() => {
    // No temp directory to clean up for this config test
  });
  const config = JSON.parse(fs.readFileSync(path.join(hooksRoot, 'verify-completion.json'), 'utf8'));
  assert.ok(config.hooks.UserPromptSubmit);
  assert.ok(config.hooks.Stop);
  assert.equal(config.hooks.UserPromptSubmit.length, 1);
  assert.equal(config.hooks.Stop.length, 1);
  assert.match(config.hooks.UserPromptSubmit[0].command, /verify-completion\.cjs$/);
  assert.match(config.hooks.Stop[0].command, /verify-completion\.cjs$/);
});
}); // end Hook configuration

// ============================================================================
// Event Routing Edge Cases
// ============================================================================

describe('Event routing edge cases', () => {
  test('completion review: VSCODE_AGENT_SESSION_ID fallback when event.session_id is missing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Run without event.session_id — should fall back to VSCODE_AGENT_SESSION_ID env var
  const response = runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Test prompt'
  }, home, cwd, { VSCODE_AGENT_SESSION_ID: 'fallback-session' });

  assert.equal(response.continue, true);
  
  // Verify state file was created with the fallback session ID
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.session_id, 'fallback-session',
    'Should use VSCODE_AGENT_SESSION_ID when event.session_id is missing');
});

test('completion review: Stop handler resets state on session mismatch', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Initialize state with session-1
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-1',
    prompt: 'Test prompt'
  }, home, cwd);

  // Increment to cycle 2
  runHook(completionHook, { hook_event_name: 'Stop', session_id: 'session-1', cwd }, home, cwd);
  runHook(completionHook, { hook_event_name: 'Stop', session_id: 'session-1', cwd }, home, cwd);

  // Send Stop with different session_id — should reset state
  const response = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'session-2',
    cwd
  }, home, cwd);

  assert.equal(response.hookSpecificOutput.decision, 'block');
  
  // Verify state was reset with new session_id and cycle incremented from 0 to 1
  // (session mismatch resets cycle to 0, then Stop handler increments to 1)
  const stateDirectory = path.join(home, '.copilot', 'hooks', '.state');
  const stateFile = path.join(
    stateDirectory,
    fs.readdirSync(stateDirectory).find(name => name.startsWith('completion-'))
  );
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.session_id, 'session-2', 'Stop handler should update session_id on mismatch');
  assert.equal(state.cycle, 1, 'Stop handler should reset cycle to 0 then increment to 1 on session mismatch');
});

test('completion review: null promptHash in state vs valid promptHash in event preserves incomplete cycle', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  const configuredCycles = fs.readFileSync(completionHook, 'utf8').match(
    /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*(\d+)/
  );
  assert.ok(configuredCycles, 'completion cycle count should be configurable');
  const maxCycles = Number(configuredCycles[1]);

  // Initialize with a valid prompt
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'null-prompt-session',
    prompt: 'Original prompt'
  }, home, cwd);

  // Increment to cycle 1
  runHook(completionHook, { hook_event_name: 'Stop', session_id: 'null-prompt-session', cwd }, home, cwd);

  // Submit with no prompt field (undefined) — preserves cycle at 1 (null !== hash, but cycle incomplete)
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'null-prompt-session'
  }, home, cwd);

  // Stop → should be cycle 2 (preserved)
  const response = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'null-prompt-session',
    cwd
  }, home, cwd);

  assert.equal(response.hookSpecificOutput.decision, maxCycles >= 2 ? 'block' : 'allow',
    `Missing prompt should preserve incomplete cycle at cycle 2 (decision depends on maxCycles=${maxCycles})`);

  // Stop → should be cycle 3 (incremented from 2)
  const response2 = runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'null-prompt-session',
    cwd
  }, home, cwd);

  if (maxCycles >= 3) {
    assert.equal(response2.hookSpecificOutput.decision, 'block',
      `Should block at cycle 3 (cycle <= maxCycles)`);

    // Continue incrementing until we reach allow using a while loop
    let current = response2;
    let stopNum = 3;
    while (current.hookSpecificOutput && current.hookSpecificOutput.decision === 'block') {
      stopNum++;
      current = runHook(completionHook, {
        hook_event_name: 'Stop',
        session_id: 'null-prompt-session',
        cwd
      }, home, cwd);
    }
    assert.equal(current.hookSpecificOutput, undefined,
      `Should allow completion at stop ${stopNum} when cycle >= maxCycles (no hookSpecificOutput)`);
    assert.equal(current.continue, true,
      'Should return continue: true when at max cycles');
  } else {
    // maxCycles < 3, cycle 3 >= maxCycles, allow
    assert.equal(response2.hookSpecificOutput, undefined,
      'Should allow completion when cycle >= maxCycles (no hookSpecificOutput)');
    assert.equal(response2.continue, true,
      'Should return continue: true when at max cycles');
  }
});

test('completion review: unknown hook event passes through', (t) => {
  // Test for untested unknown hook event path
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Send an unknown hook event name
  const response = runHook(completionHook, {
    hook_event_name: 'UnknownEvent',
    session_id: 'test-session',
    prompt: 'Test prompt'
  }, home, cwd);

  assert.equal(response.continue, true,
    'Unknown events should pass through with continue: true');
  assert.equal(response.systemMessage, undefined,
    'Unknown events should not return a systemMessage');
});
}); // end Event routing edge cases

// ============================================================================
// State Structure Validation
// ============================================================================

describe('State structure validation', () => {
  test('completion review: state files include updated_at after UserPromptSubmit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const stateDir = path.join(home, '.copilot', 'hooks', '.state');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'updated-at-session',
    prompt: 'Test prompt for updated_at verification'
  }, home, cwd);

  // Read the state file and verify updated_at is present
  const stateFiles = fs.readdirSync(stateDir);
  assert.ok(stateFiles.length > 0, 'State file should exist');
  const stateContent = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
  assert.ok(stateContent.updated_at, 'State should include updated_at field after UserPromptSubmit');
  assert.ok(typeof stateContent.updated_at === 'string', 'updated_at should be a string (ISO timestamp)');
});

test('completion review: state files include updated_at after Stop increments cycle', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const stateDir = path.join(home, '.copilot', 'hooks', '.state');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Initialize state
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'updated-at-stop-session',
    prompt: 'Test prompt for updated_at verification'
  }, home, cwd);

  // Send Stop to increment cycle
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'updated-at-stop-session',
    cwd
  }, home, cwd);

  // Read the state file and verify updated_at is present
  const stateFiles = fs.readdirSync(stateDir);
  assert.ok(stateFiles.length > 0, 'State file should exist');
  const stateContent = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
  assert.ok(stateContent.updated_at, 'State should include updated_at field after Stop');
  assert.ok(typeof stateContent.updated_at === 'string', 'updated_at should be a string (ISO timestamp)');
});

test('completion review: state files include prompt_submitted_at after UserPromptSubmit', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const stateDir = path.join(home, '.copilot', 'hooks', '.state');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Initialize state with UserPromptSubmit
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'prompt-submitted-at-session',
    prompt: 'Test prompt for prompt_submitted_at verification'
  }, home, cwd);

  // Read the state file and verify prompt_submitted_at is present
  const stateFiles = fs.readdirSync(stateDir);
  assert.ok(stateFiles.length > 0, 'State file should exist');
  const stateContent = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
  assert.ok(stateContent.prompt_submitted_at, 'State should include prompt_submitted_at field after UserPromptSubmit');
  assert.ok(typeof stateContent.prompt_submitted_at === 'string', 'prompt_submitted_at should be a string (ISO timestamp)');
  // Verify it's a valid ISO timestamp
  const parsedDate = new Date(stateContent.prompt_submitted_at);
  assert.ok(!isNaN(parsedDate.getTime()), 'prompt_submitted_at should be a valid date');
});

test('completion review: Stop event preserves prompt_submitted_at (not updated)', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  const stateDir = path.join(home, '.copilot', 'hooks', '.state');
  const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(instructionFile, 'Follow the general practices.');

  // Initialize state with UserPromptSubmit
  runHook(completionHook, {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'prompt-submitted-at-preserve-session',
    prompt: 'Test prompt for preservation test'
  }, home, cwd);

  // Read the state file and record prompt_submitted_at
  const stateFiles = fs.readdirSync(stateDir);
  const stateBefore = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
  const originalPromptSubmittedAt = stateBefore.prompt_submitted_at;
  assert.ok(originalPromptSubmittedAt, 'prompt_submitted_at should be set after UserPromptSubmit');

  // Small delay to ensure any timestamp update would be detectable
  // (though Stop should NOT update prompt_submitted_at)

  // Send Stop event
  runHook(completionHook, {
    hook_event_name: 'Stop',
    session_id: 'prompt-submitted-at-preserve-session',
    cwd
  }, home, cwd);

  // Read the state file again and verify prompt_submitted_at is unchanged
  const stateAfter = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
  assert.equal(stateAfter.prompt_submitted_at, originalPromptSubmittedAt,
    'prompt_submitted_at should be preserved after Stop event (not updated)');
  // Verify cycle was incremented but prompt_submitted_at was not
  assert.equal(stateAfter.cycle, 1, 'Cycle should be incremented after Stop');
});

}); // end describe('State structure validation')

// ============================================================================
// Edge Cases for REVIEW_CYCLES_PER_USER_MESSAGE = 1
// ============================================================================

describe('REVIEW_CYCLES_PER_USER_MESSAGE = 1 edge case', () => {
  test('completion review: maxCycles=1 creates block → allow → allow → reset → block', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    const cwd = path.join(root, 'workspace');
    const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
    const completionSource = fs.readFileSync(completionHook, 'utf8');
    const reviewPrompt = fs.readFileSync(path.join(hooksDirectory, 'completion-review-prompt.md'), 'utf8');
    
    // Temporarily set REVIEW_CYCLES_PER_USER_MESSAGE = 1
    const modifiedSource = completionSource.replace(
      /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*\d+/g,
      'REVIEW_CYCLES_PER_USER_MESSAGE = 1'
    );
    const modifiedHook = path.join(root, 'verify-completion-1.cjs');
    fs.writeFileSync(modifiedHook, modifiedSource);

    fs.mkdirSync(path.dirname(instructionFile), { recursive: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(instructionFile, 'Follow the general practices.');
    
    // Copy the review prompt file — when hook is copied to temp dir, __dirname changes
    // and REVIEW_PROMPT_FILE is resolved relative to the new __dirname
    fs.writeFileSync(path.join(root, 'completion-review-prompt.md'), reviewPrompt);

    const uniqueSessionId = `max-cycles-1-session-${Date.now()}`;

    // Initialize with UserPromptSubmit
    runHook(modifiedHook, {
      hook_event_name: 'UserPromptSubmit',
      session_id: uniqueSessionId,
      prompt: 'Test prompt'
    }, home, cwd, {}, uniqueSessionId);

    // First Stop: should block at cycle 1/1
    const stop1 = runHook(modifiedHook, {
      hook_event_name: 'Stop',
      session_id: uniqueSessionId,
      cwd
    }, home, cwd, {}, uniqueSessionId);
    assert.equal(stop1.hookSpecificOutput && stop1.hookSpecificOutput.hookEventName, 'Stop');
    assert.equal(stop1.hookSpecificOutput && stop1.hookSpecificOutput.decision, 'block');
    assert.match(stop1.hookSpecificOutput && stop1.hookSpecificOutput.reason, /CYCLE 1\/1/);

    // Second Stop: should allow (cycle 1 >= maxCycles 1, early return)
    const stop2 = runHook(modifiedHook, {
      hook_event_name: 'Stop',
      session_id: uniqueSessionId,
      cwd
    }, home, cwd, {}, uniqueSessionId);
    assert.equal(stop2.continue, true, 'Second Stop should allow (early return at max cycles)');
    assert.equal(stop2.hookSpecificOutput, undefined, 'No hookSpecificOutput when allowed');

    // Third Stop: should also allow (state still at cycle 1, no reset mechanism on Stop)
    const stop3 = runHook(modifiedHook, {
      hook_event_name: 'Stop',
      session_id: uniqueSessionId,
      cwd
    }, home, cwd, {}, uniqueSessionId);
    assert.equal(stop3.continue, true, 'Third Stop should also allow (cycle still at max)');
    assert.equal(stop3.hookSpecificOutput, undefined, 'No hookSpecificOutput when allowed');

    // UserPromptSubmit resets cycle to 0, then Stop should block again
    runHook(modifiedHook, {
      hook_event_name: 'UserPromptSubmit',
      session_id: uniqueSessionId,
      prompt: 'New prompt after max cycles'
    }, home, cwd, {}, uniqueSessionId);

    const stop4 = runHook(modifiedHook, {
      hook_event_name: 'Stop',
      session_id: uniqueSessionId,
      cwd
    }, home, cwd, {}, uniqueSessionId);
    assert.equal(stop4.hookSpecificOutput && stop4.hookSpecificOutput.hookEventName, 'Stop');
    assert.equal(stop4.hookSpecificOutput && stop4.hookSpecificOutput.decision, 'block');
    assert.match(stop4.hookSpecificOutput && stop4.hookSpecificOutput.reason, /CYCLE 1\/1/);
  });

  test('completion review: UserPromptSubmit resets cycle to 0 when previous cycle >= maxCycles (maxCycles=1)', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    const cwd = path.join(root, 'workspace');
    const stateDir = path.join(home, '.copilot', 'hooks', '.state');
    const instructionFile = path.join(home, '.copilot', 'copilot-instructions.md');
    const completionSource = fs.readFileSync(completionHook, 'utf8');
    const reviewPrompt = fs.readFileSync(path.join(hooksDirectory, 'completion-review-prompt.md'), 'utf8');
    
    // Temporarily set REVIEW_CYCLES_PER_USER_MESSAGE = 1
    const modifiedSource = completionSource.replace(
      /REVIEW_CYCLES_PER_USER_MESSAGE\s*=\s*\d+/g,
      'REVIEW_CYCLES_PER_USER_MESSAGE = 1'
    );
    const modifiedHook = path.join(root, 'verify-completion-1.cjs');
    fs.writeFileSync(modifiedHook, modifiedSource);

    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(instructionFile, 'Follow the general practices.');
    
    // Copy the review prompt file — when hook is copied to temp dir, __dirname changes
    fs.writeFileSync(path.join(root, 'completion-review-prompt.md'), reviewPrompt);

    const uniqueSessionId = `reset-verification-session-${Date.now()}`;

    // Initialize and reach max cycles
    runHook(modifiedHook, {
      hook_event_name: 'UserPromptSubmit',
      session_id: uniqueSessionId,
      prompt: 'Test prompt'
    }, home, cwd, {}, uniqueSessionId);

    runHook(modifiedHook, {
      hook_event_name: 'Stop',
      session_id: uniqueSessionId,
      cwd
    }, home, cwd, {}, uniqueSessionId);

    // Verify state is at cycle 1
    const stateFiles = fs.readdirSync(stateDir);
    const stateContent = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
    assert.equal(stateContent.cycle, 1, 'State should be at cycle 1 after first Stop');

    // Submit new prompt — should reset cycle to 0
    runHook(modifiedHook, {
      hook_event_name: 'UserPromptSubmit',
      session_id: uniqueSessionId,
      prompt: 'New prompt after max cycles'
    }, home, cwd, {}, uniqueSessionId);

    // Verify state is reset to 0
    const updatedStateContent = JSON.parse(fs.readFileSync(path.join(stateDir, stateFiles[0]), 'utf8'));
    assert.equal(updatedStateContent.cycle, 0, 'UserPromptSubmit should reset cycle to 0 when previous >= maxCycles');
  });
});
