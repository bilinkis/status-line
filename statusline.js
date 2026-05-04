#!/usr/bin/env node
/**
 * status-line — Claude Code / Codex / coding agent status bar
 * Shows: dir  ⎇ branch  ·  session/weekly usage  ·  RTK %  ·  HH:MM
 *
 * Install: curl -fsSL https://raw.githubusercontent.com/bilinkis/status-line/main/install.sh | bash
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

// 1. Current directory
const cwd = process.cwd();
const home = process.env.HOME || "";
const dirPart = cwd === home ? "~" : path.basename(cwd);

// 2. Git branch + dirty/ahead indicators
const branch = run("git rev-parse --abbrev-ref HEAD 2>/dev/null");
let branchPart = "";
if (branch && branch !== "HEAD") {
  const dirty = run("git status --porcelain 2>/dev/null");
  const ahead = run("git rev-list --count @{u}..HEAD 2>/dev/null");
  const dirtyMark = dirty ? "*" : "";
  const aheadMark = ahead && parseInt(ahead) > 0 ? ` ↑${ahead}` : "";
  branchPart = `⎇ ${branch}${dirtyMark}${aheadMark}`;
}

// 3. Claude usage limits — reads from ~/.claude/debug/usage-cache.json if present
//    (populated by the companion usage-fetch.js, or any script that writes that file)
let sessionPart = "";
let weeklyPart = "";
try {
  const cachePath = path.join(home, ".claude", "debug", "usage-cache.json");
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const cacheAge = Date.now() - new Date(cache.fetched_at).getTime();

    // Background refresh if stale (> 5 min)
    if (cacheAge > 5 * 60 * 1000) {
      const fetchScript = path.join(home, ".claude", "hooks", "usage-fetch.js");
      if (fs.existsSync(fetchScript)) {
        require("child_process")
          .spawn(process.execPath, [fetchScript], { detached: true, stdio: "ignore" })
          .unref();
      }
    }

    function humanDiff(ms) {
      if (ms <= 0) return null;
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      if (d > 0) return `${d}d ${h}h`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    }

    const sh = cache?.five_hour;
    const wk = cache?.seven_day;

    if (sh) {
      const left = Math.max(0, 100 - (sh.utilization ?? 0));
      const reset = sh.resets_at ? humanDiff(new Date(sh.resets_at) - Date.now()) : null;
      sessionPart = `session ${left}% left${reset ? `, resets in ${reset}` : ""}`;
    }

    if (wk) {
      const left = Math.max(0, 100 - (wk.utilization ?? 0));
      const reset = wk.resets_at ? humanDiff(new Date(wk.resets_at) - Date.now()) : null;
      weeklyPart = `weekly ${left}% left${reset ? `, resets in ${reset}` : ""}`;
    }
  }
} catch {}

// 4. RTK token savings (optional — only shown if rtk is installed)
let rtkPart = "";
try {
  const raw = run("rtk gain -f json 2>/dev/null");
  if (raw) {
    const pct = JSON.parse(raw)?.summary?.avg_savings_pct;
    if (pct != null) rtkPart = `RTK ${Math.round(pct)}%`;
  }
} catch {}

// 5. Active model + effort level
let modelPart = "";
try {
  const s = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  const model = (s.model || "").replace(/^claude-/, "");
  const effort = s.effortLevel && s.effortLevel !== "medium" ? ` · ${s.effortLevel}` : "";
  if (model) modelPart = model + effort;
} catch {}

// 6. Local time HH:MM
const tz = process.env.STATUS_LINE_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const timePart = new Date().toLocaleTimeString("en-GB", {
  timeZone: tz,
  hour: "2-digit",
  minute: "2-digit",
});

// Assemble
const left = [dirPart, branchPart].filter(Boolean).join("  ");
const right = [sessionPart, weeklyPart, modelPart, rtkPart, timePart].filter(Boolean).join("  ·  ");
const line = [left, right].filter(Boolean).join("  ·  ");
if (line) process.stdout.write(line);
