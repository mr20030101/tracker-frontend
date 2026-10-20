---
name: release
description: Commit the working changes, push, and cut a release (version bump, changelog, tag), in one go
argument-hint: "[patch|minor|major] (default: picked from the changelog)"
disable-model-invocation: true
---

Commit, push and release what's in the working tree. Arguments: $ARGUMENTS

Do these in order and stop at the first failure, saying what failed. Don't ask for confirmation: `/release` is the go-ahead.

1. **Look.** `git status --short` and `git diff`. If there's nothing to commit *and* nothing under **## Unreleased** in `CHANGELOG.md`, say there's nothing to release and stop.
2. **Check.** Run `npm run check` (typecheck, lint, tests). If it's red, fix what the changes broke, or stop and report if the fix isn't obvious. Never release on red.
3. **Changelog.** Every user-visible change in the diff needs a line under **## Unreleased**, grouped under `### Added`, `### Changed` or `### Fixed`, written for the people who use the tracker (what they'll notice, not which file changed). Add any that are missing; don't duplicate ones already there.
4. **Commit.** One commit per separate change: split the diff by feature when it holds unrelated work (the changelog goes in with the last one). Messages follow the history: a short imperative subject (`Add ...`, `Fix ...`, `Remove ...`), a blank line, a few lines on what and why, then the `Co-Authored-By` line. Commit on the current branch.
5. **Bump.** Use the argument if one was given. Otherwise pick it from the Unreleased notes, as `CHANGELOG.md`'s header describes:
   - only `### Fixed` → `patch`
   - anything under `### Added` or `### Changed` → `minor`
   - something removed or working differently in a way people must relearn → `major`, but say so in the reply, since it's a big jump
6. **Release.** `npm run release -- <bump>`, then `git commit -qam "Release vX.Y.Z"` and `git tag vX.Y.Z`, using the version the script printed.
7. **Push.** `git push` and `git push origin vX.Y.Z`.
8. **Report.** The version, the bump and why, the commits (short hash and subject), and that `npm run check` passed. Mention anything that wasn't checked in a browser.
