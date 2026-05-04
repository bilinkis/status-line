#!/usr/bin/env node
/**
 * Installer for status-line.
 * Run via: npx github:bilinkis/status-line
 *      or: curl -fsSL https://raw.githubusercontent.com/bilinkis/status-line/main/install.sh | bash
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const HOME = process.env.HOME || process.env.USERPROFILE;
const HOOKS_DIR = path.join(HOME, ".claude", "hooks");
const CLAUDE_SETTINGS = path.join(HOME, ".claude", "settings.json");
const CODEX_DIR = path.join(HOME, ".codex");
const CODEX_CONFIG = path.join(CODEX_DIR, "config.toml");
const SCRIPT_URL =
  "https://raw.githubusercontent.com/bilinkis/status-line/main/statusline.js";
const CLAUDE_COMMAND = 'node "$HOME/.claude/hooks/statusline.js"';
const RECOMMENDED = [
  "five-hour-limit",
  "weekly-limit",
  "current-dir",
  "git-branch",
  "model-with-reasoning",
  "codex-version",
];

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const mode = args.has("--claude")
  ? "claude"
  : args.has("--codex")
    ? "codex"
    : "both";

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(res.headers.location).then(resolve).catch(reject);
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`unexpected HTTP ${res.statusCode || "error"} while fetching ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const backup = `${file}.bak.${Date.now()}`;
  fs.copyFileSync(file, backup);
  return backup;
}

function validateScript(script) {
  if (!script.startsWith("#!/usr/bin/env node")) {
    throw new Error("downloaded statusline.js does not look like a valid Node script");
  }
}

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
  const rendered = `status_line = ${JSON.stringify(RECOMMENDED)}`;
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

async function installClaudeCode() {
  console.log("→ Installing for Claude Code...");

  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  const script = await fetch(SCRIPT_URL);
  validateScript(script);
  const dest = path.join(HOOKS_DIR, "statusline.js");
  fs.writeFileSync(dest, script);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {}

  const settings = fs.existsSync(CLAUDE_SETTINGS)
    ? JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf8"))
    : {};

  if (
    settings.statusLine &&
    JSON.stringify(settings.statusLine) !==
      JSON.stringify({ type: "command", command: CLAUDE_COMMAND }) &&
    !force
  ) {
    console.log("  ↷ ~/.claude/settings.json already has statusLine — skipped (use --force to replace)");
    return;
  }

  const backup = backupFile(CLAUDE_SETTINGS);
  settings.statusLine = {
    type: "command",
    command: CLAUDE_COMMAND,
  };

  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log("  ✓ ~/.claude/settings.json updated");
  if (backup) console.log(`  ↳ backup saved to ${backup}`);
}

function installCodex() {
  console.log("→ Configuring Codex...");
  fs.mkdirSync(CODEX_DIR, { recursive: true });

  let toml = fs.existsSync(CODEX_CONFIG) ? fs.readFileSync(CODEX_CONFIG, "utf8") : "";
  const tui = getTuiBlockInfo(toml);

  if (tui?.hasStatusLine && !force) {
    console.log("  ↷ [tui] status_line already set — skipped (use --force to replace)");
    return;
  }

  const backup = backupFile(CODEX_CONFIG);
  toml = renderCodexToml(toml, force);

  fs.writeFileSync(CODEX_CONFIG, toml);
  console.log("  ✓ ~/.codex/config.toml updated");
  if (backup) console.log(`  ↳ backup saved to ${backup}`);
}

(async () => {
  try {
    if (mode === "claude" || mode === "both") await installClaudeCode();
    if (mode === "codex" || mode === "both") installCodex();

    console.log("\nDone. Restart your agent to see the status bar.");
    console.log("Tip: set STATUS_LINE_SEGMENTS=usage,time to trim the Claude line.");
    console.log("Tip: set STATUS_LINE_TZ=America/New_York to override timezone.\n");
  } catch (err) {
    console.error("Install failed:", err.message);
    process.exit(1);
  }
})();
