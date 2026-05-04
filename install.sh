#!/usr/bin/env bash
set -euo pipefail

HOOKS_DIR="$HOME/.claude/hooks"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
CODEX_DIR="$HOME/.codex"
CODEX_CONFIG="$CODEX_DIR/config.toml"
SCRIPT_URL="https://raw.githubusercontent.com/bilinkis/status-line/main/statusline.js"
CLAUDE_COMMAND='node "$HOME/.claude/hooks/statusline.js"'
MODE="both"
FORCE="0"

for arg in "$@"; do
  case "$arg" in
    --claude) MODE="claude" ;;
    --codex) MODE="codex" ;;
    --both) MODE="both" ;;
    --force) FORCE="1" ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

install_claude() {
  echo "→ Installing for Claude Code..."
  mkdir -p "$HOOKS_DIR"
  tmp_file="$(mktemp)"
  curl -fsSL "$SCRIPT_URL" -o "$tmp_file"

  if ! head -n 1 "$tmp_file" | grep -q '^#!/usr/bin/env node$'; then
    echo "Install failed: downloaded statusline.js does not look like a valid Node script" >&2
    rm -f "$tmp_file"
    exit 1
  fi

  mv "$tmp_file" "$HOOKS_DIR/statusline.js"
  chmod +x "$HOOKS_DIR/statusline.js"

  FORCE="$FORCE" CLAUDE_SETTINGS="$CLAUDE_SETTINGS" CLAUDE_COMMAND="$CLAUDE_COMMAND" node - <<'NODE'
const fs = require("fs");
const path = require("path");

const file = process.env.CLAUDE_SETTINGS;
const command = process.env.CLAUDE_COMMAND;
const force = process.env.FORCE === "1";
const desired = { type: "command", command };
const settings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};

if (settings.statusLine && JSON.stringify(settings.statusLine) !== JSON.stringify(desired) && !force) {
  console.log("  ↷ ~/.claude/settings.json already has statusLine — skipped (use --force to replace)");
  process.exit(0);
}

if (fs.existsSync(file)) {
  const backup = `${file}.bak.${Date.now()}`;
  fs.copyFileSync(file, backup);
  console.log(`  ↳ backup saved to ${backup}`);
}

settings.statusLine = desired;
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
console.log("  ✓ ~/.claude/settings.json updated");
NODE
}

install_codex() {
  echo "→ Configuring Codex..."
  mkdir -p "$CODEX_DIR"

  FORCE="$FORCE" CODEX_CONFIG="$CODEX_CONFIG" node - <<'NODE'
const fs = require("fs");
const path = require("path");

const file = process.env.CODEX_CONFIG;
const force = process.env.FORCE === "1";
const rendered = 'status_line = ["five-hour-limit","weekly-limit","current-dir","git-branch","model-with-reasoning","codex-version"]';

function getTuiBlockInfo(toml) {
  const lines = toml.split("\n");
  const start = lines.findIndex((line) => line.trim() === "[tui]");
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\[.+\]$/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }

  const blockLines = lines.slice(start, end);
  return {
    lines,
    start,
    end,
    blockLines,
    hasStatusLine: blockLines.some((line) => /^\s*status_line\s*=/.test(line)),
  };
}

function renderCodexToml(toml, replaceExisting) {
  const tui = getTuiBlockInfo(toml);
  if (!tui) {
    const trimmed = toml.replace(/\s*$/, "");
    return `${trimmed}${trimmed ? "\n\n" : ""}[tui]\n${rendered}\n`;
  }

  const nextLines = [...tui.lines];
  if (tui.hasStatusLine) {
    if (!replaceExisting) return toml;
    for (let i = tui.start + 1; i < tui.end; i += 1) {
      if (/^\s*status_line\s*=/.test(nextLines[i])) {
        nextLines[i] = rendered;
        break;
      }
    }
    return nextLines.join("\n");
  }

  nextLines.splice(tui.start + 1, 0, rendered);
  return nextLines.join("\n");
}

const toml = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const tui = getTuiBlockInfo(toml);
const hasStatusLine = tui ? tui.hasStatusLine : false;

if (hasStatusLine && !force) {
  console.log("  ↷ [tui] status_line already set — skipped (use --force to replace)");
  process.exit(0);
}

const next = renderCodexToml(toml, force);

if (fs.existsSync(file)) {
  const backup = `${file}.bak.${Date.now()}`;
  fs.copyFileSync(file, backup);
  console.log(`  ↳ backup saved to ${backup}`);
}

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, next);
console.log("  ✓ ~/.codex/config.toml updated");
NODE
}

if [[ "$MODE" == "claude" || "$MODE" == "both" ]]; then
  install_claude
fi

if [[ "$MODE" == "codex" || "$MODE" == "both" ]]; then
  install_codex
fi

echo ""
echo "Done. Restart your agent to see the status bar."
echo "Tip: export STATUS_LINE_SEGMENTS=usage,time to trim the Claude line."
echo "Tip: export STATUS_LINE_TZ=America/New_York to override timezone."
