'use strict';

const { execFileSync } = require('child_process');
const { safeReadJson, clamp } = require('../utils');

// Conventional commit prefixes (with or without scope)
const SEMANTIC_PREFIXES = [
  'feat', 'fix', 'refactor', 'test', 'docs',
  'chore', 'style', 'perf', 'ci', 'build',
];

const SEMANTIC_RE = new RegExp(
  `^(${SEMANTIC_PREFIXES.join('|')})(\\(|:)`,
  'i'
);

/**
 * Safely run a git command against a repo. Returns stdout string or null on failure.
 */
function gitCmd(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      timeout: 5000,
      encoding: 'utf-8',
    });
  } catch {
    return null;
  }
}

/**
 * Signal 1: Claude co-authored commits (0-6 pts)
 * Search for "Co-Authored-By" across all repos.
 * Very high impact — the #1 direct evidence of productive Claude Code usage.
 */
function checkCoAuthoredCommits(gitScanRoots) {
  const signal = {
    name: 'Claude co-authored commits',
    value: '0 commits',
    points: 0,
    maxPoints: 6,
    recommendation: null,
  };

  const repos = Array.isArray(gitScanRoots) ? gitScanRoots : [];
  let totalCommits = 0;

  for (const repo of repos) {
    const output = gitCmd(repo, [
      'log', '--all', '--grep=Co-Authored-By', '--oneline', '-n', '200',
    ]);
    if (output) {
      const lines = output.trim().split(/\r?\n/).filter(Boolean);
      totalCommits += lines.length;
    }
  }

  signal.value = `${totalCommits} co-authored commit${totalCommits !== 1 ? 's' : ''} across ${repos.length} repo${repos.length !== 1 ? 's' : ''}`;

  if (totalCommits === 0)        signal.points = 0;
  else if (totalCommits <= 5)    signal.points = 1;
  else if (totalCommits <= 15)   signal.points = 2;
  else if (totalCommits <= 30)   signal.points = 3;
  else if (totalCommits <= 60)   signal.points = 4;
  else if (totalCommits <= 100)  signal.points = 5;
  else                           signal.points = 6;

  if (signal.points < 3) {
    signal.recommendation =
      'Use Claude Code to commit more often with Co-Authored-By tags \u2014 ask Claude to /commit for you';
  }

  return signal;
}

/**
 * Signal 2: Commit message quality (0-4 pts)
 * Evaluate subject line length across recent commits.
 * Medium-high impact — good git history helps Claude understand repos.
 */
function checkCommitMessageQuality(gitScanRoots) {
  const signal = {
    name: 'Commit message quality',
    value: 'No commits found',
    points: 0,
    maxPoints: 4,
    recommendation: null,
  };

  const repos = Array.isArray(gitScanRoots) ? gitScanRoots : [];
  const allSubjects = [];

  for (const repo of repos) {
    const output = gitCmd(repo, [
      'log', '--all', '--format=%s', '-n', '50',
    ]);
    if (output) {
      const lines = output.trim().split(/\r?\n/).filter(Boolean);
      allSubjects.push(...lines);
    }
  }

  if (allSubjects.length === 0) {
    signal.recommendation =
      'No commit history found \u2014 start making commits in your repos to build a track record';
    return signal;
  }

  const totalLength = allSubjects.reduce((sum, s) => sum + s.length, 0);
  const avgLength = Math.round(totalLength / allSubjects.length);

  // Count subjects in the ideal 40-72 character range
  const idealCount = allSubjects.filter(s => s.length >= 40 && s.length <= 72).length;
  const idealPct = Math.round((idealCount / allSubjects.length) * 100);

  signal.value = `avg ${avgLength} chars, ${idealPct}% in ideal range (${allSubjects.length} commits)`;

  // Score based on average length
  let lengthPts;
  if (avgLength < 20)       lengthPts = 0;
  else if (avgLength < 40)  lengthPts = 1;
  else if (avgLength <= 72) lengthPts = 2;
  else                      lengthPts = 1; // too long

  // Bonus tiers for ideal range consistency
  if (idealPct >= 80) {
    signal.points = 4;
  } else if (idealPct >= 60) {
    signal.points = 3;
  } else {
    signal.points = lengthPts;
  }

  if (signal.points < 2) {
    signal.recommendation =
      'Aim for commit subjects between 40-72 characters \u2014 descriptive but concise';
  }

  return signal;
}

/**
 * Signal 3: Semantic commit prefixes (0-1 pt)
 * Check % of commits using conventional commit format.
 * Low impact — nice convention but doesn't affect Claude's output quality.
 */
function checkSemanticPrefixes(gitScanRoots) {
  const signal = {
    name: 'Semantic commit prefixes',
    value: '0% conventional',
    points: 0,
    maxPoints: 1,
    recommendation: null,
  };

  const repos = Array.isArray(gitScanRoots) ? gitScanRoots : [];
  const allSubjects = [];

  for (const repo of repos) {
    const output = gitCmd(repo, [
      'log', '--all', '--format=%s', '-n', '50',
    ]);
    if (output) {
      const lines = output.trim().split(/\r?\n/).filter(Boolean);
      allSubjects.push(...lines);
    }
  }

  if (allSubjects.length === 0) {
    signal.recommendation =
      'No commits found \u2014 use conventional commit prefixes like feat:, fix:, refactor: in your messages';
    return signal;
  }

  const semanticCount = allSubjects.filter(s => SEMANTIC_RE.test(s.trim())).length;
  const pct = Math.round((semanticCount / allSubjects.length) * 100);

  signal.value = `${pct}% conventional (${semanticCount}/${allSubjects.length} commits)`;

  signal.points = pct > 0 ? 1 : 0;

  if (signal.points === 0) {
    signal.recommendation =
      'Adopt conventional commit prefixes (feat:, fix:, refactor:, docs:, etc.) for better changelogs and history';
  }

  return signal;
}

/**
 * Signal 4: Usage activity (0-4 pts)
 * Parse stats-cache.json for sessions, messages, and daily activity.
 * Medium impact — volume ≠ effectiveness, but consistency matters.
 */
function checkUsageActivity(statsPath) {
  const signal = {
    name: 'Usage activity',
    value: 'No stats found',
    points: 0,
    maxPoints: 4,
    recommendation: null,
  };

  const stats = safeReadJson(statsPath);
  if (!stats || typeof stats !== 'object') {
    signal.recommendation =
      'Use Claude Code more to generate usage stats \u2014 the stats file is created after your first session';
    return signal;
  }

  const totalSessions = stats.totalSessions || 0;
  const totalMessages = stats.totalMessages || 0;
  const dailyActivity = stats.dailyActivity || [];
  const daysActive = Array.isArray(dailyActivity) ? dailyActivity.length : Object.keys(dailyActivity).length;

  const details = [];
  let pts = 0;

  // Sessions scoring (0-3)
  let sessionPts = 0;
  if (totalSessions === 0)       sessionPts = 0;
  else if (totalSessions <= 5)   sessionPts = 1;
  else if (totalSessions <= 15)  sessionPts = 2;
  else                           sessionPts = 3;
  pts += sessionPts;
  details.push(`${totalSessions} sessions`);

  // Messages bonus
  if (totalMessages > 500) {
    pts += 1;
  }
  details.push(`${totalMessages} messages`);

  // Days active bonus
  if (daysActive >= 4) {
    pts += 1;
  }
  details.push(`${daysActive} days active`);

  signal.points = clamp(pts, 0, 4);
  signal.value = details.join(', ');

  if (signal.points < 3) {
    signal.recommendation =
      'Use Claude Code regularly across multiple days to build consistent usage patterns';
  }

  return signal;
}

/**
 * Signal 5: Model diversity (0-2 pts)
 * Check how many distinct models have been used.
 * Low impact — single-model mastery is valid. Reduced weight.
 */
function checkModelDiversity(statsPath) {
  const signal = {
    name: 'Model diversity',
    value: '0 models',
    points: 0,
    maxPoints: 2,
    recommendation: null,
  };

  const stats = safeReadJson(statsPath);
  if (!stats || typeof stats !== 'object') {
    signal.recommendation =
      'Use Claude Code to generate stats \u2014 try different models (Sonnet, Opus, Haiku) for different tasks';
    return signal;
  }

  // Try modelUsage first, then dailyModelTokens
  const modelNames = new Set();

  if (stats.modelUsage && typeof stats.modelUsage === 'object') {
    for (const key of Object.keys(stats.modelUsage)) {
      if (key) modelNames.add(key);
    }
  }

  if (Array.isArray(stats.dailyModelTokens)) {
    // dailyModelTokens is an array of { date, tokensByModel: { "model-name": count } }
    for (const entry of stats.dailyModelTokens) {
      if (entry && entry.tokensByModel && typeof entry.tokensByModel === 'object') {
        for (const modelKey of Object.keys(entry.tokensByModel)) {
          if (modelKey) modelNames.add(modelKey);
        }
      }
    }
  } else if (stats.dailyModelTokens && typeof stats.dailyModelTokens === 'object') {
    // Fallback: object keyed by date
    for (const dayData of Object.values(stats.dailyModelTokens)) {
      if (dayData && typeof dayData === 'object') {
        for (const modelKey of Object.keys(dayData)) {
          if (modelKey) modelNames.add(modelKey);
        }
      }
    }
  }

  const count = modelNames.size;
  const modelList = Array.from(modelNames).slice(0, 5); // Show up to 5

  signal.value = `${count} model${count !== 1 ? 's' : ''}${modelList.length > 0 ? ` (${modelList.join(', ')})` : ''}`;

  if (count === 0)      signal.points = 0;
  else if (count === 1) signal.points = 1;
  else                  signal.points = 2;

  if (signal.points < 2) {
    signal.recommendation =
      'Try different models for different tasks \u2014 Haiku for quick edits, Sonnet for general work, Opus for complex reasoning';
  }

  return signal;
}

/**
 * Signal 6: Hooks configured (0-3 pts)
 * Check settings.json for hooks configuration.
 * High leverage — hooks automate quality gates (lint, test, format) on every action.
 */
function checkHooksConfigured(settingsPath) {
  const signal = {
    name: 'Hooks configured',
    value: 'No hooks',
    points: 0,
    maxPoints: 3,
    recommendation: null,
  };

  const settings = safeReadJson(settingsPath);
  if (!settings || typeof settings !== 'object') {
    signal.recommendation =
      'Add hooks to ~/.claude/settings.json to automate pre/post actions (linting, testing, formatting)';
    return signal;
  }

  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') {
    signal.recommendation =
      'Add hooks to ~/.claude/settings.json to automate pre/post actions (linting, testing, formatting)';
    return signal;
  }

  // Count hook types (e.g., "preCommit", "postCommit", "preToolUse", etc.)
  const hookTypes = Object.keys(hooks).filter(k => {
    const val = hooks[k];
    // A hook type is valid if it's an array with entries, or a non-empty object
    if (Array.isArray(val)) return val.length > 0;
    if (val && typeof val === 'object') return Object.keys(val).length > 0;
    return false;
  });

  const hookCount = hookTypes.length;

  // Count total matchers across all hook types
  let totalMatchers = 0;
  for (const ht of hookTypes) {
    const val = hooks[ht];
    if (Array.isArray(val)) {
      totalMatchers += val.length;
    } else if (val && typeof val === 'object') {
      totalMatchers += Object.keys(val).length;
    }
  }

  signal.value = `${hookCount} hook type${hookCount !== 1 ? 's' : ''}, ${totalMatchers} matcher${totalMatchers !== 1 ? 's' : ''}`;

  if (hookCount === 0) {
    signal.points = 0;
  } else if (hookCount === 1 && totalMatchers <= 1) {
    signal.points = 1;
  } else if (hookCount >= 3 || totalMatchers >= 4) {
    // 3+ hook types OR 4+ total matchers — comprehensive automation
    signal.points = 3;
  } else {
    // 2 hook types OR 1 type with multiple matchers
    signal.points = 2;
  }

  if (signal.points < 2) {
    signal.recommendation =
      'Configure hooks in settings.json for automated workflows \u2014 e.g., lint on save, test before commit';
  }

  return signal;
}

/**
 * Main scanner entry point.
 * @param {object} paths - Resolved paths from resolve.js
 * @returns {{ dimension: string, score: number, maxScore: number, signals: object[] }}
 */
function scan(paths) {
  const signals = [
    checkCoAuthoredCommits(paths.gitScanRoots),
    checkCommitMessageQuality(paths.gitScanRoots),
    checkSemanticPrefixes(paths.gitScanRoots),
    checkUsageActivity(paths.statsPath),
    checkModelDiversity(paths.statsPath),
    checkHooksConfigured(paths.settingsPath),
  ];

  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const score = clamp(rawScore, 0, 20);

  return {
    dimension: 'Automation & Git',
    score,
    maxScore: 20,
    signals,
  };
}

module.exports = { scan };
