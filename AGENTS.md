# Remi — agent instructions

**See [CLAUDE.md](./CLAUDE.md).** It is the single source of truth for this project's
architecture, stack, conventions, and development workflow, and applies to any coding agent
working here — Claude, Codex, or otherwise.

This file used to be a byte-for-byte copy of CLAUDE.md (they had drifted to differ on one
line), so it is now a pointer. Do not re-fork it: edit `CLAUDE.md` instead.

Process rules, judgement calls, and hard-won gotchas live in Claude's memory directory
(`~/.claude/projects/-Users-michaeljames-Projects-dog-show-entries/memory/`). If you are an
agent without access to that directory, note that `CLAUDE.md` deliberately does *not*
duplicate it — ask before assuming a process rule.
