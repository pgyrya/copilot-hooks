const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * VS Code Copilot Completion Review Hook
 * 
 * Purpose: Enforces review of general practices after N completion cycles
 * to ensure quality and alignment with project standards.
 * 
 * Lifecycle:
 * 1. UserPromptSubmit: Initializes or updates state for a prompt
 * 2. Stop (×N): Increments cycle counter after each completion
 * 3. At max cycles: Blocks completion and prompts user to review practices
 * 
 * State File Format:
 * {
 *   "session_id": "sha256-hash-of-session",
 *   "cycle": 0,              // Current cycle count (0 to REVIEW_CYCLES_PER_USER_MESSAGE)
 *   "prompt_hash": "sha256-hash", // Hash of the prompt text (null if no prompt provided)
 *   "prompt_submitted_at": "ISO-8601-timestamp",
 *   "updated_at": "ISO-8601-timestamp"
 * }
 * 
 * State File Location: ~/.copilot/hooks/.state/completion-{session_key}.json
 * 
 * Configuration:
 * - REVIEW_CYCLES_PER_USER_MESSAGE: Max review cycles before allowing the agent to stop (default: 2)
 *   this means the first REVIEW_CYCLES_PER_USER_MESSAGE attempts to stop the session will be blocked.
 * 
 * @module verify-completion
 */

const REVIEW_CYCLES_PER_USER_MESSAGE = 2; // Number of Stop events to block before allowing completion (~5 review cycles per user message)
const INSTRUCTIONS_FILE = path.join(
  os.homedir(),
  '.copilot',
  'copilot-instructions.md'
);
const REVIEW_PROMPT_FILE = path.join(__dirname, 'completion-review-prompt.md');

let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute SHA256 hash of a string, returning first 16 hex chars.
 */
function hashSessionId(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
}

/**
 * Compute SHA256 hash of a prompt string, or null if prompt is not a string.
 */
function hashPrompt(prompt) {
  return typeof prompt === 'string'
    ? crypto.createHash('sha256').update(prompt).digest('hex')
    : null;
}

/**
 * Get the state file path for a given session ID.
 */
function getStatePath(sessionId) {
  const sessionKey = hashSessionId(sessionId);
  return path.join(os.homedir(), '.copilot', 'hooks', '.state', `completion-${sessionKey}.json`);
}

/**
 * Read and parse state file, returning null if it doesn't exist or is invalid.
 */
function readState(stateFile) {
  if (!fs.existsSync(stateFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write state to file, creating directories if needed.
 */
function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Validate that state has expected structure. Returns true if valid.
 */
function isValidState(state) {
  return state &&
    Number.isInteger(state.cycle) &&
    state.cycle >= 0 &&
    state.cycle <= REVIEW_CYCLES_PER_USER_MESSAGE;
}

/**
 * Handle UserPromptSubmit event.
 */
function handleUserPromptSubmit(event, stateFile) {
  const promptHash = hashPrompt(event.prompt);
  let stateWarning = undefined; // Set when state is reset; used in block response return

  // Check if state file exists and read it
  let previousState = null;
  let stateFileExists = fs.existsSync(stateFile);
  let stateCorrupted = false;
  
  if (stateFileExists) {
    try {
      previousState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (error) {
      // Corrupted state file (invalid JSON)
      stateCorrupted = true;
      stateWarning = `Completion hook reset invalid state before processing this prompt: ${error.message}`;
      previousState = null;
    }
  }

  // Check if session changed — if so, ignore (don't touch other sessions' state)
  if (previousState && previousState.session_id !== event.session_id) {
    return { continue: true };
  }

  // Check for corrupted state — reset immediately
  if (stateCorrupted) {
    writeState(stateFile, {
      session_id: event.session_id,
      cycle: 0,
      prompt_hash: promptHash,
      prompt_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    return { continue: true, systemMessage: stateWarning };
  }

  // Check state validity — reset if invalid structure
  if (previousState && !isValidState(previousState)) {
    stateWarning = `Completion hook reset invalid state before processing this prompt: invalid state structure`;
    writeState(stateFile, {
      session_id: event.session_id,
      cycle: 0,
      prompt_hash: promptHash,
      prompt_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    return { continue: true, systemMessage: stateWarning };
  }

  // Determine if this is a new prompt
  const isNewPrompt = !promptHash || !previousState || !previousState.prompt_hash || previousState.prompt_hash !== promptHash;

  // Handle new prompt scenarios
  if (isNewPrompt) {
    if (!previousState || previousState.cycle >= REVIEW_CYCLES_PER_USER_MESSAGE) {
      // New prompt AND previous cycle completed — reset cycle
      writeState(stateFile, {
        session_id: event.session_id,
        cycle: 0,
        prompt_hash: promptHash,
        prompt_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } else {
      // New prompt with incomplete cycle — preserve cycle but update prompt_hash
      const updatedState = {
        ...previousState,
        prompt_hash: promptHash,
        prompt_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      writeState(stateFile, updatedState);
    }
  }

  return { continue: true };
}

/**
 * Handle Stop event — increment cycle and decide whether to block or allow.
 *
 * Return Values:
 * - At max cycles:  { continue: true }  // No hookSpecificOutput signals "proceed"
 * - Blocked:        { continue: true, hookSpecificOutput: { hookEventName: 'Stop', decision: 'block', reason } }
 * - Error:          { continue: true, systemMessage: '...' }
 */
function handleStop(event, stateFile) {
  // Load or initialize state
  let state = readState(stateFile);
  let stateWarning = undefined; // Set when state is reset; included in block return via spread operator
  
  if (!state || state.session_id !== event.session_id || !isValidState(state)) {
    // If state exists but is invalid (e.g., cycle out of range), warn
    if (state && !isValidState(state)) {
      if (!Number.isInteger(state.cycle)) {
        stateWarning = `Completion hook reset invalid state before processing this stop: cycle value '${state.cycle}' is not a valid integer`;
      } else if (state.cycle < 0 || state.cycle > REVIEW_CYCLES_PER_USER_MESSAGE) {
        stateWarning = `Completion hook reset invalid state before processing this stop: cycle ${state.cycle} is out of range [0, ${REVIEW_CYCLES_PER_USER_MESSAGE}]`;
      }
    }
    state = {
      session_id: event.session_id,
      cycle: 0,
      prompt_hash: null,
      prompt_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  // Already at max cycles — skip review
  if (state.cycle >= REVIEW_CYCLES_PER_USER_MESSAGE) {
    return { continue: true };
  }

  // Read general practices
  let generalPractices;
  try {
    generalPractices = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8').trim();
  } catch (error) {
    return {
      continue: true,
      systemMessage: `Completion review could not read ${INSTRUCTIONS_FILE}: ${error.message}`
    };
  }

  if (!generalPractices) {
    return {
      continue: true,
      systemMessage: `Completion review found no general practices in ${INSTRUCTIONS_FILE}.`
    };
  }

  // Read review prompt
  let reviewPrompt;
  try {
    reviewPrompt = fs.readFileSync(REVIEW_PROMPT_FILE, 'utf8').trim();
  } catch (error) {
    return {
      continue: true,
      systemMessage: `Completion review could not read ${REVIEW_PROMPT_FILE}: ${error.message}`
    };
  }

  if (!reviewPrompt) {
    return {
      continue: true,
      systemMessage: `Completion review prompt is empty: ${REVIEW_PROMPT_FILE}.`
    };
  }

  // Increment cycle and save state
  state.cycle += 1;
  state.updated_at = new Date().toISOString();
  writeState(stateFile, state);

  // At this point cycle <= REVIEW_CYCLES_PER_USER_MESSAGE (early return above),
  // so decision is always 'block' — no 'allow' path exists after cycle increment.
  // The 'decision' field is retained for API compatibility with the hook system
  // which expects a decision field in hookSpecificOutput for Stop events.
  const decision = 'block';
  const reason = `
GENERAL-PRACTICE REVIEW REQUIRED — CYCLE ${state.cycle}/${REVIEW_CYCLES_PER_USER_MESSAGE}

Do not stop yet. Restate and apply these general practices:

${generalPractices}

${reviewPrompt}
`;

  return {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision,
      reason
    },
    ...(stateWarning ? { systemMessage: stateWarning } : {})
  };
}

// ============================================================================
// Main Event Handler
// ============================================================================

process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input);
    const sessionId = event.session_id || process.env.VSCODE_AGENT_SESSION_ID || 'default-session';
    const stateFile = getStatePath(sessionId);

    if (event.hook_event_name === 'UserPromptSubmit') {
      const result = handleUserPromptSubmit({ ...event, session_id: sessionId }, stateFile);
      process.stdout.write(JSON.stringify(result));
    } else if (event.hook_event_name === 'Stop') {
      const result = handleStop({ ...event, session_id: sessionId }, stateFile);
      process.stdout.write(JSON.stringify(result));
    } else {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        continue: true,
        systemMessage: `Completion review hook error: ${error.message}`
      })
    );
  }
});
