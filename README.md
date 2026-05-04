# status-line

A real status bar for Claude Code and Codex.

```
my-project  ⎇ main*  ·  session 82% left, resets in 1h 20m  ·  weekly 64% left, resets in 5d 3h  ·  RTK 71%  ·  14:32
```

**What it shows:**
- Current folder + git branch (`*` = dirty tree, `↑N` = unpushed commits)
- Session / weekly usage remaining (requires [usage-fetch](https://github.com/bilinkis/status-line) setup)
- [RTK](https://github.com/bilinkis/rtk) token savings % — only shown if `rtk` is installed
- Local time (auto-detected timezone)

## Install

**One-liner:**
```bash
curl -fsSL https://raw.githubusercontent.com/bilinkis/status-line/main/install.sh | bash
```

**Or via npx:**
```bash
npx github:bilinkis/status-line
```

Both installers handle Claude Code and Codex automatically.

Requires Node.js (already present if you have Claude Code).

## Timezone

```bash
export STATUS_LINE_TZ="America/New_York"
```

Add to your shell profile (`~/.zshrc` or `~/.bashrc`) to persist.

## Usage display

The `s:X% w:X%` fields require a `~/.claude/debug/usage-cache.json` file written by a companion script that authenticates with claude.ai. Without it those fields are silently hidden — everything else still works.

## Codex

The installer auto-detects `~/.codex/config.toml` and sets the recommended `[tui] status_line` slots:

```toml
[tui]
status_line = ["current-dir", "git-branch", "run-state", "task-progress", "context-remaining", "five-hour-limit", "weekly-limit", "model-with-reasoning"]
```

If you already have a `[tui]` section with `status_line` configured, it's left untouched.

## Manual install (Claude Code)

1. Copy `statusline.js` to `~/.claude/hooks/statusline.js`
2. Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"$HOME/.claude/hooks/statusline.js\""
  }
}
```
