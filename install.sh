#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$HOME/.claude/hooks"
CODEX_CONFIG="$HOME/.codex/config.toml"
SCRIPT_URL="https://raw.githubusercontent.com/bilinkis/status-line/main/statusline.js"

# ── Claude Code ────────────────────────────────────────────────────────────────

echo "→ Installing for Claude Code..."
mkdir -p "$HOOKS_DIR"
curl -fsSL "$SCRIPT_URL" -o "$HOOKS_DIR/statusline.js"
chmod +x "$HOOKS_DIR/statusline.js"

node - <<'NODE'
const fs = require("fs");
const path = require("path");
const file = path.join(process.env.HOME, ".claude", "settings.json");
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
s.statusLine = { type: "command", command: 'node "$HOME/.claude/hooks/statusline.js"' };
fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
console.log("  ✓ ~/.claude/settings.json updated");
NODE

# ── Codex ──────────────────────────────────────────────────────────────────────

if [ -f "$CODEX_CONFIG" ]; then
  echo "→ Configuring Codex..."
  node - "$CODEX_CONFIG" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const RECOMMENDED = '["current-dir","git-branch","run-state","task-progress","context-remaining","five-hour-limit","weekly-limit","model-with-reasoning"]';

let toml = fs.readFileSync(file, "utf8");

if (/^\[tui\]/m.test(toml)) {
  if (/^\s*status_line\s*=/m.test(toml)) {
    console.log("  ↷ [tui] status_line already set — skipped");
    process.exit(0);
  }
  toml = toml.replace(/^(\[tui\])/m, `$1\nstatus_line = ${RECOMMENDED}`);
} else {
  toml += `\n[tui]\nstatus_line = ${RECOMMENDED}\n`;
}

fs.writeFileSync(file, toml);
console.log("  ✓ ~/.codex/config.toml updated");
NODE
fi

echo ""
echo "Done. Restart your agent to see the status bar."
echo "Tip: export STATUS_LINE_TZ=America/New_York to override timezone."
