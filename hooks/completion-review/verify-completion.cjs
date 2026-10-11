const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Completion review hook: block the first N Stop attempts of each agent turn.
 *
 * Invariant: within one turn, at most N consecutive Stop events are blocked, whatever other events
 * (UserPromptSubmit from subagents, tool calls, ...) arrive in between.
 *
 * A "turn" starts at the first Stop with stop_hook_active=false (the harness is not continuing
 * because of a previous block). UserPromptSubmit is deliberately not used: the harness also fires it
 * for subagent prompts in the same session, so it cannot identify a user message.
 */

const DEFAULT_REVIEW_CYCLES = 2;
const HOME = os.homedir();
const INSTRUCTIONS_FILE = path.join(HOME, '.copilot', 'copilot-instructions.md');
const REVIEW_PROMPT_FILE = path.join(__dirname, 'completion-review-prompt.md');

function maxCycles(env = process.env) {
  const raw = env.COMPLETION_REVIEW_CYCLES;
  return /^\d+$/.test(raw ?? '') ? Number(raw) : DEFAULT_REVIEW_CYCLES;
}

/**
 * Pure decision: (previous cycle count, event) -> { cycle, action }.
 * action: 'block' | 'allow' | 'unknown' (harness did not tell us whether we are mid-block).
 */
function decide(previousCycle, event, max) {
  if (typeof event.stop_hook_active !== 'boolean') return { cycle: 0, action: 'unknown' };
  const cycle = event.stop_hook_active && Number.isInteger(previousCycle) && previousCycle >= 0 ? previousCycle : 0;
  return cycle >= max ? { cycle, action: 'allow' } : { cycle: cycle + 1, action: 'block' };
}

/** Select the `## Cycle N` / `## Final cycle` section; a prompt without such headings applies to all cycles. */
function selectSection(prompt, cycle, max) {
  const parts = prompt.split(/^(?=## (?:Cycle \d+|Final cycle)\b)/m);
  if (parts.length === 1) return prompt;
  const intro = parts[0].trim();
  const wanted = parts.find(p => (cycle === max ? /^## Final cycle\b/ : new RegExp(`^## Cycle ${cycle}\\b`)).test(p))
    ?? parts.find(p => /^## Final cycle\b/.test(p));
  return [intro, wanted && wanted.trim()].filter(Boolean).join('\n\n');
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).cycle; } catch { return null; }
}

function handleStop(event, { stateFile, max }) {
  const { cycle, action } = decide(readState(stateFile), event, max);
  if (action === 'unknown') {
    return { continue: true, systemMessage: 'Completion review skipped: Stop event has no boolean stop_hook_active.' };
  }
  if (action === 'allow') return { continue: true };

  let practices, prompt;
  try {
    practices = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8').trim();
    prompt = fs.readFileSync(REVIEW_PROMPT_FILE, 'utf8').trim();
  } catch (error) {
    return { continue: true, systemMessage: `Completion review skipped: ${error.message}` };
  }
  if (!practices || !prompt) {
    return { continue: true, systemMessage: 'Completion review skipped: instructions or review prompt file is empty.' };
  }

  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ cycle, updated_at: new Date().toISOString() }));
  return {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: `COMPLETION REVIEW — CYCLE ${cycle}/${max} (do not stop yet)\n\n${practices}\n\n${selectSection(prompt, cycle, max)}\n`
    }
  };
}

function stateFileFor(sessionId) {
  const key = require('node:crypto').createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return path.join(HOME, '.copilot', 'hooks', '.state', `completion-${key}.json`);
}

module.exports = { decide, selectSection, handleStop, maxCycles, stateFileFor };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    let out;
    try {
      const event = JSON.parse(input);
      out = event.hook_event_name === 'Stop'
        ? handleStop(event, { stateFile: stateFileFor(event.session_id || process.env.VSCODE_AGENT_SESSION_ID || 'default-session'), max: maxCycles() })
        : { continue: true };
    } catch (error) {
      out = { continue: true, systemMessage: `Completion review hook error: ${error.message}` };
    }
    process.stdout.write(JSON.stringify(out));
  });
}
