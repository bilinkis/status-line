#!/usr/bin/env node
/**
 * Installer for status-line.
 * Run via: npx github:bilinkis/status-line
 *      or: curl -fsSL https://raw.githubusercontent.com/bilinkis/status-line/main/install.sh | bash
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const HOME = process.env.HOME || process.env.USERPROFILE;
const HOOKS_DIR = path.join(HOME, ".claude", "hooks");
const CODEX_CONFIG = path.join(HOME, ".codex", "config.toml");
const SCRIPT_URL =
  "https://raw.githubusercontent.com/bilinkis/status-line/main/statusline.js";

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function installClaudeCode() {
  console.log("→ Installing for Claude Code...");

  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  const script = await fetch(SCRIPT_URL);
  const dest = path.join(HOOKS_DIR, "statusline.js");
  fs.writeFileSync(dest, script);
  try { fs.chmodSync(dest, 0o755); } catch {}

  const settingsPath = path.join(HOME, ".claude", "settings.json");
  const settings = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
    : {};

  settings.statusLine = {
    type: "command",
    command: 'node "$HOME/.claude/hooks/statusline.js"',
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log("  ✓ ~/.claude/settings.json updated");
}

function installCodex() {
  if (!fs.existsSync(CODEX_CONFIG)) return;

  console.log("→ Configuring Codex...");

  const RECOMMENDED = [
    "current-dir",
    "git-branch",
    "five-hour-limit",
    "weekly-limit",
    "model-with-reasoning",
    "codex-version",
  ];

  let toml = fs.readFileSync(CODEX_CONFIG, "utf8");

  if (/^\[tui\]/m.test(toml)) {
    if (/^\s*status_line\s*=/m.test(toml)) {
      console.log("  ↷ [tui] status_line already set — skipped");
      return;
    }
    // Inject status_line under existing [tui] header
    toml = toml.replace(
      /^(\[tui\])/m,
      `$1\nstatus_line = ${JSON.stringify(RECOMMENDED)}`
    );
  } else {
    const entry =
      "\n[tui]\nstatus_line = " + JSON.stringify(RECOMMENDED) + "\n";
    toml += entry;
  }

  fs.writeFileSync(CODEX_CONFIG, toml);
  console.log("  ✓ ~/.codex/config.toml updated");
}

(async () => {
  try {
    await installClaudeCode();
    installCodex();
    console.log("\nDone. Restart your agent to see the status bar.");
    console.log("Tip: set STATUS_LINE_TZ=America/New_York to override timezone.\n");
  } catch (err) {
    console.error("Install failed:", err.message);
    process.exit(1);
  }
})();
