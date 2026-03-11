'use strict';

const { safeReadFile, safeReadJson, wordCount, listFiles, safeReaddir } = require('../utils');
const path = require('path');

// Secret patterns — used for COUNTING only. Matched values are NEVER stored or output.
const SECRET_PATTERNS = [
  /AKIA[A-Z0-9]{16}/,                    // AWS access keys
  /sk-[a-zA-Z0-9]{20,}/,                 // OpenAI-style API keys
  /ghp_[a-zA-Z0-9]{36}/,                 // GitHub personal access tokens
  /-----BEGIN.*PRIVATE KEY-----/,         // Private key blocks
  /Bearer ey[a-zA-Z0-9._-]+/,            // JWT bearer tokens
];

// Credential-related keyword categories for signal 3
const CREDENTIAL_KEYWORDS = [
  { category: 'env-file',      patterns: ['.env'] },
  { category: 'credential',    patterns: ['credential'] },
  { category: 'dotenv',        patterns: ['dotenv'] },
  { category: 'secret',        patterns: ['secret'] },
  { category: 'vault',         patterns: ['vault'] },
  { category: 'env-variable',  patterns: ['environment variable'] },
];

// Plugins considered security-adjacent
const SECURITY_PLUGINS = [
  'security-guidance',
  'code-review',
  'code-simplifier',
];

/**
 * Signal 1: Security rules file (0-5 pts)
 * Look for files whose filename contains "security" in the rules directory.
 * Score based on combined word count.
 */
function checkSecurityRulesFile(rulesDir) {
  const signal = {
    name: 'Security rules file',
    value: 'No security rules file found',
    points: 0,
    maxPoints: 5,
    recommendation: 'Create a security.md rules file to define credential handling policies',
  };

  try {
    const entries = safeReaddir(rulesDir);
    const securityFiles = entries.filter(
      f => f.toLowerCase().includes('security') && f.endsWith('.md')
    );

    if (securityFiles.length === 0) {
      return signal;
    }

    let totalWords = 0;
    for (const fileName of securityFiles) {
      const content = safeReadFile(path.join(rulesDir, fileName));
      totalWords += wordCount(content);
    }

    signal.value = `${securityFiles.length} file${securityFiles.length !== 1 ? 's' : ''}, ${totalWords.toLocaleString()} words`;

    if (totalWords === 0)        signal.points = 0;
    else if (totalWords < 100)   signal.points = 1;
    else if (totalWords < 300)   signal.points = 2;
    else if (totalWords < 500)   signal.points = 3;
    else if (totalWords < 1000)  signal.points = 4;
    else                         signal.points = 5;

    if (signal.points >= 4) {
      signal.recommendation = null;
    } else if (signal.points >= 1) {
      signal.recommendation = 'Expand your security rules file \u2014 aim for 1000+ words covering credential handling, dependency safety, and code review policies';
    }
  } catch {
    // Directory unreadable — leave at 0
  }

  return signal;
}

/**
 * Signal 2: No hardcoded secrets (0-1 pt, INVERTED)
 * Scan .md, .json, .js files in claudeRoot for secret patterns.
 * 1 point for clean, 0 if any found.
 *
 * CRITICAL: Only COUNT occurrences. NEVER log, store, or output matched values.
 */
function checkNoHardcodedSecrets(claudeRoot) {
  const signal = {
    name: 'No hardcoded secrets',
    value: '0 files with potential secrets',
    points: 3,
    maxPoints: 3,
    recommendation: null,
  };

  try {
    const SCAN_EXTENSIONS = ['.md', '.json', '.js'];

    // Collect files from top-level, rules/, and agents/
    const dirsToScan = [
      claudeRoot,
      path.join(claudeRoot, 'rules'),
      path.join(claudeRoot, 'agents'),
    ];

    const filesToScan = [];
    for (const dir of dirsToScan) {
      const entries = safeReaddir(dir);
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (SCAN_EXTENSIONS.includes(ext)) {
          filesToScan.push(path.join(dir, entry));
        }
      }
    }

    let filesWithSecrets = 0;

    for (const filePath of filesToScan) {
      const content = safeReadFile(filePath);
      if (!content) continue;

      let fileHasMatch = false;
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          fileHasMatch = true;
          break; // One match per file is enough — stop checking this file
        }
      }

      if (fileHasMatch) {
        filesWithSecrets++;
      }
    }

    signal.value = `${filesWithSecrets} file${filesWithSecrets !== 1 ? 's' : ''} with potential secrets`;

    if (filesWithSecrets === 0)      signal.points = 3;
    else if (filesWithSecrets === 1) signal.points = 1;
    else                             signal.points = 0;

    if (filesWithSecrets > 0) {
      signal.recommendation = `Found potential secret patterns in ${filesWithSecrets} file${filesWithSecrets !== 1 ? 's' : ''} \u2014 remove hardcoded credentials and use environment variables instead`;
    }
  } catch {
    // Scan failure — assume clean (3 points)
    signal.value = 'Scan could not complete';
  }

  return signal;
}

/**
 * Signal 3: Centralized credential references (0-3 pts)
 * Check if any rules .md files mention credential-related keywords.
 * Each unique keyword category found = 1pt, max 3.
 */
function checkCentralizedCredentialRefs(rulesDir) {
  const signal = {
    name: 'Centralized credential references',
    value: '0 credential keyword categories found',
    points: 0,
    maxPoints: 4,
    recommendation: 'Add credential management guidelines to your rules files \u2014 mention .env, dotenv, vault, or environment variable patterns',
  };

  try {
    const files = listFiles(rulesDir, '.md');
    if (files.length === 0) return signal;

    let combinedText = '';
    for (const filePath of files) {
      const content = safeReadFile(filePath);
      if (content) combinedText += ' ' + content;
    }

    const lowerText = combinedText.toLowerCase();

    const matchedCategories = [];
    for (const kw of CREDENTIAL_KEYWORDS) {
      const found = kw.patterns.some(p => lowerText.includes(p));
      if (found) {
        matchedCategories.push(kw.category);
      }
    }

    const count = matchedCategories.length;
    signal.value = `${count} credential keyword categor${count !== 1 ? 'ies' : 'y'} found (${matchedCategories.join(', ') || 'none'})`;
    signal.points = Math.min(count, 4);

    if (signal.points >= 4) {
      signal.recommendation = null;
    } else if (signal.points >= 1) {
      signal.recommendation = 'Expand credential management coverage in your rules \u2014 mention more patterns like vault, dotenv, and environment variables';
    }
  } catch {
    // Read failure — leave at 0
  }

  return signal;
}

/**
 * Signal 4: Plugin blocklist with reasons (0-2 pts)
 * Parse blocklist JSON and count entries with non-empty reason field.
 */
function checkBlocklistReasons(blocklistPath) {
  const signal = {
    name: 'Plugin blocklist with reasons',
    value: 'No blocklist found',
    points: 0,
    maxPoints: 2,
    recommendation: 'Create a plugin blocklist with documented reasons to control which MCP plugins Claude can use',
  };

  try {
    const blocklist = safeReadJson(blocklistPath);
    if (!blocklist) return signal;

    // Structure: { plugins: [ { plugin, reason, ... }, ... ] }
    let entries = [];
    if (blocklist.plugins && Array.isArray(blocklist.plugins)) {
      entries = blocklist.plugins;
    } else if (Array.isArray(blocklist)) {
      entries = blocklist;
    }

    const withReasons = entries.filter(entry => {
      if (!entry || typeof entry !== 'object') return false;
      return typeof entry.reason === 'string' && entry.reason.trim().length > 0;
    });

    const count = withReasons.length;
    signal.value = `${count} blocklist entr${count !== 1 ? 'ies' : 'y'} with reasons (${entries.length} total entries)`;

    if (count === 0)      signal.points = 0;
    else if (count === 1) signal.points = 1;
    else                  signal.points = 2;

    if (signal.points >= 2) {
      signal.recommendation = null;
    } else if (signal.points === 1) {
      signal.recommendation = 'Add documented reasons to more blocklist entries to maintain a clear security audit trail';
    }
  } catch {
    // Parse failure — leave at 0
  }

  return signal;
}

/**
 * Signal 6: Security-adjacent plugins (0-3 pts)
 * Check enabledPlugins for security-related plugin names.
 */
function checkSecurityPlugins(settingsPath) {
  const signal = {
    name: 'Security-adjacent plugins',
    value: 'No security plugins enabled',
    points: 0,
    maxPoints: 3,
    recommendation: 'Enable security-adjacent plugins like security-guidance, code-review, or code-simplifier for safer coding workflows',
  };

  try {
    const settings = safeReadJson(settingsPath);
    if (!settings || typeof settings !== 'object') return signal;

    const enabledPlugins = settings.enabledPlugins;
    if (!enabledPlugins || typeof enabledPlugins !== 'object') return signal;

    // enabledPlugins is an object like { "code-review@claude-plugins-official": true }
    const enabledKeys = Object.keys(enabledPlugins).filter(k => enabledPlugins[k] === true);
    const lowerKeys = enabledKeys.map(k => k.toLowerCase());

    const matched = SECURITY_PLUGINS.filter(sp =>
      lowerKeys.some(ek => ek.includes(sp))
    );

    const count = matched.length;
    signal.value = `${count} security plugin${count !== 1 ? 's' : ''} enabled (${matched.join(', ') || 'none'})`;

    if (count === 0)      signal.points = 0;
    else if (count === 1) signal.points = 1;
    else if (count === 2) signal.points = 2;
    else                  signal.points = 3;

    if (signal.points >= 2) {
      signal.recommendation = null;
    }
  } catch {
    // Parse failure — leave at 0
  }

  return signal;
}

/**
 * Signal 7: Any security behavior (0-3 pts)
 * Awards points for having ANY intentional security practice,
 * preventing the dimension from being zero for users who made
 * at least some effort. Checks for the presence of any security
 * rules, credential references, or secrets MCP configuration.
 *
 * This signal is evaluated AFTER the other signals run.
 */
function checkAnySecurityBehavior(otherSignals) {
  const signal = {
    name: 'Security awareness',
    value: 'No security behavior detected',
    points: 0,
    maxPoints: 3,
    recommendation: 'Start with any security practice \u2014 create a security rules file, reference .env policies in rules, or enable security plugins',
  };

  // Count how many of the other signals scored > 0
  const activeSignals = otherSignals.filter(s => s.points > 0);
  const count = activeSignals.length;

  if (count === 0) {
    return signal;
  }

  const names = activeSignals.map(s => s.name);
  signal.value = `${count} active security practice${count !== 1 ? 's' : ''} (${names.slice(0, 3).join(', ')})`;

  if (count === 1)      signal.points = 1;
  else if (count === 2) signal.points = 2;
  else                  signal.points = 3;

  if (signal.points >= 2) {
    signal.recommendation = null;
  } else {
    signal.recommendation = 'Broaden your security coverage \u2014 add credential references to rules, enable security plugins, and ensure no hardcoded secrets';
  }

  return signal;
}

/**
 * Main scanner entry point.
 * @param {object} paths - Resolved paths from resolve.js
 * @returns {{ dimension: string, score: number, maxScore: number, signals: object[] }}
 */
function scan(paths) {
  // Run core signals first
  const coreSignals = [
    checkSecurityRulesFile(paths.rulesDir),
    checkNoHardcodedSecrets(paths.claudeRoot),
    checkCentralizedCredentialRefs(paths.rulesDir),
    checkBlocklistReasons(paths.blocklistPath),
    checkSecurityPlugins(paths.settingsPath),
  ];

  // Meta-signal: how many security behaviors are active
  const behaviorSignal = checkAnySecurityBehavior(coreSignals);

  const signals = [...coreSignals, behaviorSignal];
  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const score = Math.max(0, Math.min(20, rawScore));

  return {
    dimension: 'Knowledge & Security',
    score,
    maxScore: 20,
    signals,
  };
}

module.exports = { scan };
