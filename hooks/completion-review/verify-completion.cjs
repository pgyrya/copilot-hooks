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

const HOME = os.homedir();
const REVIEW_PROMPT_FILE = path.join(__dirname, 'completion-review-prompt.md');

/** Count the number of cycle-specific level-2 headings in the prompt. */
function countCycles(prompt) {
  const headings = prompt.match(/^## (?:Cycle \d+|Final cycle)\b/gm);
  return headings ? headings.length : 0;
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

/** Extract a section from a markdown file by its level-1 or level-2 heading name. */
function extractSection(content, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Split by level-1 headings first
  const l1Parts = content.split(/^# /m);
  for (const part of l1Parts) {
    if (part.startsWith(`${sectionName}\n`) || part.startsWith(`${sectionName}\r\n`)) {
      // Return the heading + everything under it
      const full = `# ${part.trim()}`;
      return full.trim() || null;
    }
  }
  
  // Not level-1, try level-2
  const l2Parts = content.split(/^(?=^## )/m);
  for (const part of l2Parts) {
    const headingRegex = new RegExp(`^## ${escaped}\\b`);
    if (headingRegex.test(part)) {
      // Return the heading + everything under it
      return part.trim() || null;
    }
  }
  
  return null;
}

/** Resolve all {reference:file:section} placeholders in text. */
function resolveReferences(text) {
  return text.replace(/\{reference:(.+?):([^}]+?)\}/g, (match, file, section) => {
    const filePath = path.resolve(path.dirname(REVIEW_PROMPT_FILE), file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const extracted = extractSection(content, section);
      if (extracted) {
        return extracted;
      }
      return `[Reference not found: ${file}:${section}]`;
    } catch {
      return `[Reference not found: ${file}:${section}]`;
    }
  });
}

/** Build the full review prompt for a given cycle: section text + resolved references. */
function buildPrompt(prompt, cycle, max) {
  let section = selectSection(prompt, cycle, max);
  section = resolveReferences(section);
  return section;
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).cycle; } catch { return null; }
}

function handleStop(event, { stateFile, prompt }) {
  const max = countCycles(prompt);
  if (max === 0) {
    return { continue: true, systemMessage: 'Completion review skipped: no cycle headings found in prompt.' };
  }

  const { cycle, action } = decide(readState(stateFile), event, max);
  if (action === 'unknown') {
    return { continue: true, systemMessage: 'Completion review skipped: Stop event has no boolean stop_hook_active.' };
  }
  if (action === 'allow') return { continue: true };

  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ cycle, updated_at: new Date().toISOString() }));
  return {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: `COMPLETION REVIEW — CYCLE ${cycle}/${max} (do not stop yet)\n\n${buildPrompt(prompt, cycle, max)}\n`
    }
  };
}

function stateFileFor(sessionId) {
  const key = require('node:crypto').createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return path.join(HOME, '.copilot', 'hooks', '.state', `completion-${key}.json`);
}

module.exports = { decide, selectSection, buildPrompt, resolveReferences, extractSection, handleStop, countCycles, stateFileFor };

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    let out;
    try {
      const event = JSON.parse(input);
      out = event.hook_event_name === 'Stop'
        ? (() => {
            let prompt;
            try { prompt = fs.readFileSync(REVIEW_PROMPT_FILE, 'utf8').trim(); } catch { prompt = ''; }
            return handleStop(event, { stateFile: stateFileFor(event.session_id || process.env.VSCODE_AGENT_SESSION_ID || 'default-session'), prompt });
          })()
        : { continue: true };
    } catch (error) {
      out = { continue: true, systemMessage: `Completion review hook error: ${error.message}` };
    }
    process.stdout.write(JSON.stringify(out));
  });
}
