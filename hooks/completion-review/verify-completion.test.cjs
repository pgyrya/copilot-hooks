const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');
const { decide, selectSection, maxCycles } = require('./verify-completion.cjs');

/*
 * Invariants of the completion review hook, and the test that fails if each is broken.
 * (Keep this list short and free of counts; see user-story.md for background.)
 *
 *  I1  Within one turn at most N consecutive Stops are blocked, whatever else the harness sends.
 *      -> "at most N blocks per turn" (randomized interleavings)
 *  I2  The cycle counter is advanced only by Stop events: UserPromptSubmit (which VS Code also fires for
 *      subagent prompts) cannot re-arm the review.
 *      -> "replay of the real VS Code log", "UserPromptSubmit is ignored"
 *  I3  A new turn (stop_hook_active=false) always starts at cycle 1, however stale or damaged the state.
 *      -> "decide: new turn", "decide: damaged state", "damaged state file"
 *  I4  The hook never blocks when it cannot do its job (unknown harness, missing/empty/garbled input).
 *      -> "decide: unknown harness", "missing or empty instructions", "malformed input"
 *  I5  Sessions do not influence each other.  -> "sessions are independent"
 *  I6  Shipped config points at real scripts, and the shipped prompt has the sections the hook selects.
 *      -> "hook configs", "shipped prompt"
 */

const HOOK = path.join(__dirname, 'verify-completion.cjs');

function makeHome({ instructions = 'PRACTICES' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-hook-'));
  fs.mkdirSync(path.join(home, '.copilot'), { recursive: true });
  if (instructions !== null) fs.writeFileSync(path.join(home, '.copilot', 'copilot-instructions.md'), instructions);
  return home;
}

function run(home, event, env = {}) {
  const input = typeof event === 'string' ? event : JSON.stringify(event);
  const result = spawnSync(process.execPath, [HOOK], {
    env: { ...process.env, HOME: home, COMPLETION_REVIEW_CYCLES: '2', ...env },
    input,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const stop = (active, session = 's1') => ({ hook_event_name: 'Stop', session_id: session, stop_hook_active: active });
const prompt = (text, session = 's1') => ({ hook_event_name: 'UserPromptSubmit', session_id: session, prompt: text });

// "1/2" for a block, "ALLOW" otherwise
function outcome(out) {
  const m = out.hookSpecificOutput?.reason.match(/CYCLE (\d+\/\d+)/);
  return m ? m[1] : 'ALLOW';
}

describe('decide() — state machine', () => {
  test('at most N blocks per turn (randomized interleavings)', () => {
    for (const max of [0, 1, 2, 5]) {
      for (let seed = 1; seed <= 300; seed++) {
        let rnd = seed;
        const next = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
        let cycle = null;
        let blocks = 0;
        for (let i = 0; i < 60; i++) {
          if (next() < 0.4) continue; // non-Stop events never reach decide()
          const newTurn = next() < 0.1;
          const d = decide(cycle, { stop_hook_active: !newTurn }, max);
          cycle = d.cycle;
          if (newTurn) blocks = 0;
          if (d.action === 'block') blocks++;
          assert.ok(blocks <= max, `max=${max} seed=${seed}: ${blocks} blocks in one turn`);
        }
      }
    }
  });

  test('new turn: blocks from cycle 1 even after a previous turn was exhausted', () => {
    assert.deepEqual(decide(2, { stop_hook_active: false }, 2), { cycle: 1, action: 'block' });
    assert.deepEqual(decide(null, { stop_hook_active: false }, 2), { cycle: 1, action: 'block' });
  });

  test('continuing turn: counts up to N, then allows and keeps allowing', () => {
    assert.deepEqual(decide(1, { stop_hook_active: true }, 2), { cycle: 2, action: 'block' });
    assert.deepEqual(decide(2, { stop_hook_active: true }, 2), { cycle: 2, action: 'allow' });
    assert.deepEqual(decide(2, { stop_hook_active: true }, 2), { cycle: 2, action: 'allow' });
  });

  test('damaged state is treated as cycle 0', () => {
    for (const bad of [null, undefined, -1, 1.5, '1', NaN]) {
      assert.deepEqual(decide(bad, { stop_hook_active: true }, 2), { cycle: 1, action: 'block' }, String(bad));
    }
  });

  test('unknown harness: no boolean stop_hook_active means never block', () => {
    for (const v of [undefined, null, 'true', 1]) {
      assert.equal(decide(0, { stop_hook_active: v }, 2).action, 'unknown');
    }
  });

  test('zero cycles disables the review', () => {
    assert.equal(decide(null, { stop_hook_active: false }, 0).action, 'allow');
  });

  test('maxCycles: env override, invalid values fall back to default', () => {
    assert.equal(maxCycles({ COMPLETION_REVIEW_CYCLES: '3' }), 3);
    for (const bad of [undefined, '', 'x', '-1', '1.5']) {
      assert.equal(maxCycles({ COMPLETION_REVIEW_CYCLES: bad }), 2, String(bad));
    }
  });
});

describe('hook process — real events', () => {
  // Sequence recorded in the VS Code "GitHub Copilot Chat Hooks" log (2026-10-07): the review asks for a
  // subagent, whose prompt arrives as UserPromptSubmit in the same session between Stops. The old
  // prompt-hash based hook answered 1/2, 2/2, 1/2, 2/2 here, so the agent could never stop.
  test('replay of the real VS Code log: review ends after N blocks', () => {
    const home = makeHome();
    const events = [
      stop(false),
      prompt('Critically review the following contribution…'),
      stop(true),
      prompt('CRITICAL REVIEW REQUEST - Security Proposal…'),
      stop(true),
      prompt('CRITICAL REVIEW REQUEST — VS Code Copilot Hooks…'),
      stop(true)
    ];
    const stops = events.map(e => [e, run(home, e)]).filter(([e]) => e.hook_event_name === 'Stop').map(([, o]) => outcome(o));
    assert.deepEqual(stops, ['1/2', '2/2', 'ALLOW', 'ALLOW']);
  });

  test('the next user turn is reviewed again', () => {
    const home = makeHome();
    const seq = [stop(false), stop(true), stop(true), stop(false), stop(true), stop(true)].map(e => outcome(run(home, e)));
    assert.deepEqual(seq, ['1/2', '2/2', 'ALLOW', '1/2', '2/2', 'ALLOW']);
  });

  test('UserPromptSubmit is ignored: no output beyond continue, no state written', () => {
    const home = makeHome();
    assert.deepEqual(run(home, prompt('hello')), { continue: true });
    assert.equal(fs.existsSync(path.join(home, '.copilot', 'hooks', '.state')), false);
  });

  test('block reason contains the practices and the section for the cycle', () => {
    const home = makeHome({ instructions: 'MY-PRACTICES' });
    const first = run(home, stop(false)).hookSpecificOutput.reason;
    const last = run(home, stop(true)).hookSpecificOutput.reason;
    assert.match(first, /MY-PRACTICES/);
    assert.match(first, /## Cycle 1/);
    assert.match(last, /## Final cycle/);
    assert.doesNotMatch(last, /## Cycle 1/);
  });

  test('COMPLETION_REVIEW_CYCLES env var controls the number of blocks', () => {
    const home = makeHome();
    const env = { COMPLETION_REVIEW_CYCLES: '1' };
    assert.deepEqual([stop(false), stop(true)].map(e => outcome(run(home, e, env))), ['1/1', 'ALLOW']);
  });

  test('sessions are independent', () => {
    const home = makeHome();
    const seq = [stop(false, 'a'), stop(false, 'b'), stop(true, 'a'), stop(true, 'b'), stop(true, 'a')]
      .map(e => outcome(run(home, e)));
    assert.deepEqual(seq, ['1/2', '1/2', '2/2', '2/2', 'ALLOW']);
  });

  test('damaged state file: recovers and still blocks', () => {
    const home = makeHome();
    run(home, stop(false));
    const stateDir = path.join(home, '.copilot', 'hooks', '.state');
    for (const file of fs.readdirSync(stateDir)) fs.writeFileSync(path.join(stateDir, file), '{not json');
    assert.equal(outcome(run(home, stop(true))), '1/2');
  });

  test('missing or empty instructions: never blocks, explains why', () => {
    for (const instructions of [null, '  \n']) {
      const out = run(makeHome({ instructions }), stop(false));
      assert.equal(out.continue, true);
      assert.equal(out.hookSpecificOutput, undefined);
      assert.match(out.systemMessage, /skipped/);
    }
  });

  test('Stop without boolean stop_hook_active: never blocks, explains why', () => {
    const out = run(makeHome(), { hook_event_name: 'Stop', session_id: 's1' });
    assert.equal(out.hookSpecificOutput, undefined);
    assert.match(out.systemMessage, /stop_hook_active/);
  });

  test('malformed input: never blocks, explains why', () => {
    const out = run(makeHome(), '{oops');
    assert.equal(out.continue, true);
    assert.equal(out.hookSpecificOutput, undefined);
    assert.match(out.systemMessage, /error/);
  });
});

describe('shipped files', () => {
  test('hook configs: every command points at an existing script, completion review listens to Stop only', () => {
    const hooksRoot = path.join(__dirname, '..');
    const configs = fs.readdirSync(hooksRoot).filter(f => f.endsWith('.json'));
    assert.ok(configs.length > 0);
    for (const file of configs) {
      const { hooks } = JSON.parse(fs.readFileSync(path.join(hooksRoot, file), 'utf8'));
      for (const entries of Object.values(hooks)) {
        for (const { command } of entries) {
          const script = command.match(/~\/\.copilot\/(\S+\.cjs)/)?.[1];
          assert.ok(script, `${file}: cannot find a ~/.copilot/*.cjs path in "${command}"`);
          assert.ok(fs.existsSync(path.join(__dirname, '..', '..', script)), `${file}: missing ${script}`);
        }
      }
    }
    const completion = JSON.parse(fs.readFileSync(path.join(hooksRoot, 'verify-completion.json'), 'utf8'));
    assert.deepEqual(Object.keys(completion.hooks), ['Stop']);
  });

  test('shipped prompt: every cycle selects a distinct, non-empty section', () => {
    const shipped = fs.readFileSync(path.join(__dirname, 'completion-review-prompt.md'), 'utf8');
    const first = selectSection(shipped, 1, 2);
    const last = selectSection(shipped, 2, 2);
    assert.match(first, /## Cycle 1/);
    assert.match(last, /## Final cycle/);
    assert.notEqual(first, last);
  });

  test('prompt sections: no headings applies to all cycles; extra cycles fall back to the final section', () => {
    assert.equal(selectSection('plain', 1, 2), 'plain');
    const p = 'intro\n## Cycle 1 — a\nA\n## Final cycle — z\nZ\n';
    assert.match(selectSection(p, 1, 3), /^intro\n\n## Cycle 1 — a\nA$/);
    assert.match(selectSection(p, 2, 3), /## Final cycle — z/);
    assert.match(selectSection(p, 3, 3), /## Final cycle — z/);
  });
});
