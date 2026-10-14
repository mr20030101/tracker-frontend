// Closed-loop gate for Claude Code. Registered as a Stop hook in .claude/settings.json: while a
// loop is running, Claude can't finish its turn until `npm run check` (typecheck, lint, tests)
// is green, and it's sent back to work with the failing output instead. Outside a loop it does
// nothing, so ordinary sessions in this repo stop as usual.
//
//   npm run loop:start -- "goal" [maxTurns]   start a loop (default ceiling: 15 turns)
//   npm run loop:status                       show the running loop
//   npm run loop:stop                         end it by hand
//
// Rules the gate enforces mechanically, so the agent can't talk its way to "done":
// - the check must actually pass; Claude's own opinion that it's finished doesn't count
// - test files that existed when the loop started can't be edited or deleted, so a loop can't
//   go green by weakening the tests (new test files are fine, and expected)
// - after maxTurns blocked stops the loop gives up and hands back to you, so it never spins forever

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const STATE_DIR = join(ROOT, '.claude/loop')
const STATE_FILE = join(STATE_DIR, 'state.json')
const DEFAULT_MAX_TURNS = 15
const CHECK_TIMEOUT_MS = 8 * 60 * 1000
const OUTPUT_TAIL_LINES = 60

const readState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : null)
const writeState = (state) => {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)
}
const clearState = () => rmSync(STATE_FILE, { force: true })

// Every test file, tracked or not (a loop may have just written one).
function testFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.test.ts', '*.test.tsx'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

const hashFile = (file) => createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex')

function start(goal, maxTurnsArg) {
  if (!goal) {
    console.error('Usage: npm run loop:start -- "goal" [maxTurns]')
    process.exit(1)
  }
  const maxTurns = maxTurnsArg ? Number(maxTurnsArg) : DEFAULT_MAX_TURNS
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    console.error('maxTurns must be a whole number of 1 or more.')
    process.exit(1)
  }
  const testHashes = Object.fromEntries(testFiles().map((file) => [file, hashFile(file)]))
  writeState({ goal, maxTurns, turns: 0, startedAt: new Date().toISOString(), testHashes })
  console.log(`Loop started (ceiling: ${maxTurns} turns). Goal: ${goal}`)
  console.log(`Locked ${Object.keys(testHashes).length} existing test file(s).`)
}

function status() {
  const state = readState()
  if (!state) return console.log('No loop running.')
  console.log(`Goal: ${state.goal}\nTurns: ${state.turns}/${state.maxTurns}\nStarted: ${state.startedAt}`)
}

// Stop-hook output: block sends `reason` back to Claude as its next instruction; otherwise the
// stop goes ahead and `systemMessage` is shown to the user.
const block = (reason) => console.log(JSON.stringify({ decision: 'block', reason }))
const allow = (systemMessage) => console.log(JSON.stringify({ systemMessage }))

function gate() {
  // Drain the hook's stdin payload; nothing in it is needed, but leaving it unread can stall the pipe.
  try {
    readFileSync(0)
  } catch {
    // No stdin (run by hand).
  }

  const state = readState()
  if (!state) return

  state.turns += 1
  if (state.turns > state.maxTurns) {
    clearState()
    return allow(`Loop stopped at its ${state.maxTurns}-turn ceiling without going green. Goal: ${state.goal}`)
  }
  writeState(state)

  const tampered = Object.entries(state.testHashes).filter(
    ([file, hash]) => !existsSync(join(ROOT, file)) || hashFile(file) !== hash,
  )
  if (tampered.length) {
    return block(
      `Loop gate (turn ${state.turns}/${state.maxTurns}): these test files existed when the loop started and have been ` +
        `changed or deleted: ${tampered.map(([file]) => file).join(', ')}. Restore them (git checkout -- <file>) ` +
        `and fix the code instead; add new tests in new files. Goal: ${state.goal}`,
    )
  }

  const check = spawnSync('npm', ['run', 'check', '--silent'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
  })
  if (check.status === 0) {
    clearState()
    return allow(`Loop gate green after ${state.turns} turn(s): typecheck, lint and tests pass. Goal: ${state.goal}`)
  }

  const output = `${check.stdout ?? ''}\n${check.stderr ?? ''}`.trim().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n')
  const why = check.error ? `the check didn't finish (${check.error.message})` : '`npm run check` failed'
  block(
    `Loop gate (turn ${state.turns}/${state.maxTurns}): ${why}. You're not done; keep working until it passes. ` +
      `Goal: ${state.goal}\n\nLast ${OUTPUT_TAIL_LINES} lines:\n${output}`,
  )
}

const [command, ...args] = process.argv.slice(2)
if (command === 'start') start(args[0], args[1])
else if (command === 'stop') {
  clearState()
  console.log('Loop stopped.')
} else if (command === 'status') status()
else gate()
