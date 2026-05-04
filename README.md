# status-line

A status line setup for Claude Code and Codex.

Claude Code example:

```text
my-project  ⎇ main*  ·  session 82% left, resets in 1h 20m  ·  weekly 64% left, resets in 5d 3h  ·  RTK 71%  ·  14:32
```

**What Claude Code shows:**
- Current folder + git branch (`*` = dirty tree, `↑N` = unpushed commits)
- Session / weekly usage remaining (requires [usage-fetch](https://github.com/bilinkis/status-line) setup)
- [RTK](https://github.com/bilinkis/rtk) token savings % — only shown if `rtk` is installed
- Local time (auto-detected timezone)

**What Codex shows:**
- Native Codex footer slots only
- Session / weekly limit remaining
- Current folder + git branch
- Active model and Codex version

Codex does **not** run `statusline.js`. It only gets native `[tui].status_line` entries.

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

Optional flags:

```bash
npx github:bilinkis/status-line --claude
npx github:bilinkis/status-line --codex
npx github:bilinkis/status-line --both
npx github:bilinkis/status-line --force
```

Requires Node.js (already present if you have Claude Code).

## Timezone

```bash
export STATUS_LINE_TZ="America/New_York"
```

Add to your shell profile (`~/.zshrc` or `~/.bashrc`) to persist.

## Segment selection (Claude Code)

You can trim the custom Claude line:

```bash
export STATUS_LINE_SEGMENTS="usage,time"
```

Available segments: `dir`, `git`, `usage`, `model`, `rtk`, `time`

## Usage display

The verbose `session ...` and `weekly ...` fields require a `~/.claude/debug/usage-cache.json` file written by a companion script that authenticates with claude.ai. Without it those fields are hidden and everything else still works.

If the cache gets old, the line marks those values as `[stale]` and throttles background refresh attempts.

## Codex

The installer configures `~/.codex/config.toml` with native `[tui] status_line` slots:

```toml
[tui]
status_line = ["five-hour-limit", "weekly-limit", "current-dir", "git-branch", "model-with-reasoning", "codex-version"]
```

If you already have a `[tui]` `status_line`, it's left untouched unless you pass `--force`.

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
