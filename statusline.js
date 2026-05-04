#!/usr/bin/env node
/**
 * status-line — Claude Code status bar companion.
 * Codex uses native [tui].status_line slots and does not execute this script.
 *
 * Shows configurable segments from:
 * - current dir
 * - git branch / dirty / ahead
 * - session / weekly usage remaining
 * - active Claude model
 * - RTK savings
 * - local time
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const home = process.env.HOME || "";
const debugDir = path.join(home, ".claude", "debug");
const statePath = path.join(debugDir, "statusline-state.json");
const usageCachePath = path.join(debugDir, "usage-cache.json");
const usageAttemptPath = path.join(debugDir, "usage-refresh-attempt.txt");
const usageStaleMs = parseInt(process.env.STATUS_LINE_USAGE_STALE_MS || "", 10) || 5 * 60 * 1000;
const usageRefreshThrottleMs =
  parseInt(process.env.STATUS_LINE_USAGE_REFRESH_THROTTLE_MS || "", 10) || 60 * 1000;
const gitCacheMs = parseInt(process.env.STATUS_LINE_GIT_CACHE_MS || "", 10) || 3000;
const rtkCacheMs = parseInt(process.env.STATUS_LINE_RTK_CACHE_MS || "", 10) || 30000;
const defaultSegments = ["dir", "git", "usage", "model", "rtk", "time"];
const enabledSegments = new Set(
  (process.env.STATUS_LINE_SEGMENTS || defaultSegments.join(","))
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
);

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function readState() {
  return readJson(statePath, { git: {}, rtk: {} });
}

function writeState(state) {
  writeJson(statePath, state);
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

function shouldShow(segment) {
  return enabledSegments.has(segment);
}

function getDirPart() {
  const cwd = process.cwd();
  return cwd === home ? "~" : path.basename(cwd);
}

function getGitPart() {
  const cwd = process.cwd();
  const now = Date.now();
  const state = readState();
  const cached = state.git?.[cwd];
  if (cached && now - cached.ts < gitCacheMs) return cached.value;

  const raw = run("git status --porcelain=2 --branch 2>/dev/null");
  let value = "";
  if (raw) {
    let branch = "";
    let ahead = 0;
    let dirty = false;

    for (const line of raw.split("\n")) {
      if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length).trim();
      } else if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+)/);
        ahead = match ? parseInt(match[1], 10) : 0;
      } else if (line && !line.startsWith("#")) {
        dirty = true;
      }
    }

    if (branch && branch !== "(detached)" && branch !== "HEAD") {
      const dirtyMark = dirty ? "*" : "";
      const aheadMark = ahead > 0 ? ` ↑${ahead}` : "";
      value = `⎇ ${branch}${dirtyMark}${aheadMark}`;
    }
  }

  state.git = state.git || {};
  state.git[cwd] = { ts: now, value };
  writeState(state);
  return value;
}

function maybeRefreshUsageCache(cacheAge) {
  if (cacheAge <= usageStaleMs) return;

  const fetchScript = path.join(home, ".claude", "hooks", "usage-fetch.js");
  if (!fs.existsSync(fetchScript)) return;

  let lastAttempt = 0;
  try {
    lastAttempt = parseInt(fs.readFileSync(usageAttemptPath, "utf8"), 10) || 0;
  } catch {}
  if (Date.now() - lastAttempt < usageRefreshThrottleMs) return;

  try {
    fs.mkdirSync(path.dirname(usageAttemptPath), { recursive: true });
    fs.writeFileSync(usageAttemptPath, String(Date.now()));
    require("child_process")
      .spawn(process.execPath, [fetchScript], { detached: true, stdio: "ignore" })
      .unref();
  } catch {}
}

function getUsageParts() {
  let sessionPart = "";
  let weeklyPart = "";

  try {
    if (!fs.existsSync(usageCachePath)) return { sessionPart, weeklyPart };

    const cache = JSON.parse(fs.readFileSync(usageCachePath, "utf8"));
    const fetchedAt = new Date(cache.fetched_at).getTime();
    const cacheAge = Number.isFinite(fetchedAt) ? Date.now() - fetchedAt : Number.POSITIVE_INFINITY;
    maybeRefreshUsageCache(cacheAge);

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
  } catch {}

  return { sessionPart, weeklyPart };
}

function getRtkPart() {
  const now = Date.now();
  const state = readState();
  const cached = state.rtk;
  if (cached && now - cached.ts < rtkCacheMs) return cached.value || "";

  let value = "";
  try {
    const raw = run("rtk gain -f json 2>/dev/null");
    if (raw) {
      const pct = JSON.parse(raw)?.summary?.avg_savings_pct;
      if (pct != null) value = `RTK ${Math.round(pct)}%`;
    }
  } catch {}

  state.rtk = { ts: now, value };
  writeState(state);
  return value;
}

function getModelPart() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
    const model = (settings.model || "").replace(/^claude-/, "");
    const effort =
      settings.effortLevel && settings.effortLevel !== "medium" ? ` · ${settings.effortLevel}` : "";
    return model ? model + effort : "";
  } catch {
    return "";
  }
}

function getTimePart() {
  const tz = process.env.STATUS_LINE_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
}

const left = [
  shouldShow("dir") ? getDirPart() : "",
  shouldShow("git") ? getGitPart() : "",
]
  .filter(Boolean)
  .join("  ");

const usage = shouldShow("usage") ? getUsageParts() : { sessionPart: "", weeklyPart: "" };
const right = [
  usage.sessionPart,
  usage.weeklyPart,
  shouldShow("model") ? getModelPart() : "",
  shouldShow("rtk") ? getRtkPart() : "",
  shouldShow("time") ? getTimePart() : "",
]
  .filter(Boolean)
  .join("  ·  ");

const line = [left, right].filter(Boolean).join("  ·  ");
if (line) process.stdout.write(line);
