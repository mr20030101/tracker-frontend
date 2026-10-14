---
description: Fix a bug or build a small change in a closed loop that can't stop until typecheck, lint and tests are green
argument-hint: <what to fix or build> [max turns, default 15]
---

Work on this in a closed loop: $ARGUMENTS

The Stop hook in `.claude/hooks/loop-gate.mjs` decides when you're done, not you. Follow these steps in order.

1. **Investigate.** Find the code behind the behaviour and the cause. Don't guess a file; read until you know.
2. **Write the failing test first.** Add a Vitest test in a *new* file next to the code (`src/lib/foo.test.ts`, or `foo.<topic>.test.ts` if one already exists) that reproduces the problem. Run `npx vitest run <file>` and confirm it fails *for the right reason*. If the behaviour can't be tested without a browser or the live database, stop and say so instead of starting the loop.
3. **Start the loop.** Run `npm run loop:start -- "<one-line goal>" <max turns>` (use the max turns from the arguments if given). This locks every existing test file: editing or deleting one blocks you.
4. **Fix the code** until `npm run check` passes. When you try to stop, the gate runs the check; if it's red you'll be sent back with the output. Fix the code, never the locked tests.
5. **Finish.** Once the gate lets you stop, summarise the cause, the fix and the new test. If the loop hit its ceiling instead, say what's still failing and why.

Rules: stay on the current branch, don't commit unless asked, and keep changes to what the goal needs. Add a line under **Unreleased** in `CHANGELOG.md` for any user-visible fix.
