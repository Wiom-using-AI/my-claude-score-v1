'use strict';

const path = require('path');
const { safeReadJson, countFiles, fileExistsAndNonEmpty, lineCount, listFiles, clamp } = require('../utils');

const STRATEGIC_PLUGINS = [
  'security-guidance',
  'code-review',
  'typescript-lsp',
  'pyright-lsp',
  'playwright',
];

/**
 * Dimension 2: Tool Fluency (0-20 points)
 * Measures how well the user leverages Claude Code's tooling ecosystem —
 * MCP servers, plugins, slash commands, keybindings, launch configs, and blocklist curation.
 */
function scan(paths) {
  const signals = [];
  const settings = safeReadJson(paths.settingsPath) || {};

  // ── Signal 1: MCP servers configured (0-5 pts) ──────────────────────
  const mcpServers = settings.mcpServers || {};
  const mcpCount = Object.keys(mcpServers).length;
  const mcpPoints = clamp(mcpCount, 0, 5);
  signals.push({
    name: 'MCP servers configured',
    value: mcpCount,
    points: mcpPoints,
    maxPoints: 5,
    recommendation: mcpCount < 3
      ? 'Connect more MCP servers (filesystem, GitHub, Slack, etc.) to extend Claude\'s reach into your workflow.'
      : null,
  });

  // ── Signal 2: Plugins enabled (0-5 pts) ─────────────────────────────
  const enabledPlugins = settings.enabledPlugins || {};
  const enabledCount = Object.keys(enabledPlugins).filter(k => enabledPlugins[k] === true).length;
  let pluginPoints = 0;
  if (enabledCount >= 16) pluginPoints = 5;
  else if (enabledCount >= 11) pluginPoints = 4;
  else if (enabledCount >= 7) pluginPoints = 3;
  else if (enabledCount >= 4) pluginPoints = 2;
  else if (enabledCount >= 1) pluginPoints = 1;
  signals.push({
    name: 'Plugins enabled',
    value: enabledCount,
    points: pluginPoints,
    maxPoints: 5,
    recommendation: enabledCount < 4
      ? 'Enable more plugins to unlock specialized capabilities — code review, LSP integration, and security guidance are great starting points.'
      : null,
  });

  // ── Signal 3: Custom slash commands (0-3 pts) ───────────────────────
  const cmdFiles = listFiles(paths.commandsDir, '.md');
  const cmdCount = cmdFiles.length;
  let avgLines = 0;
  if (cmdCount > 0) {
    const totalLines = cmdFiles.reduce((sum, f) => sum + lineCount(f), 0);
    avgLines = Math.round(totalLines / cmdCount);
  }
  let cmdPoints = 0;
  if (cmdCount >= 3 && avgLines > 20) cmdPoints = 3;
  else if (cmdCount >= 2) cmdPoints = 2;
  else if (cmdCount >= 1) cmdPoints = 1;
  signals.push({
    name: 'Custom slash commands',
    value: `${cmdCount} commands, avg ${avgLines} lines`,
    points: cmdPoints,
    maxPoints: 3,
    recommendation: cmdCount < 2
      ? 'Create custom slash commands in ~/.claude/commands/ to automate repetitive prompts (e.g., /review, /test, /deploy).'
      : cmdPoints < 3
        ? 'Flesh out your slash commands with more detailed prompts (aim for >20 lines each) to get richer, more consistent results.'
        : null,
  });

  // ── Signal 4: Keybindings customized (0-2 pts) ──────────────────────
  let kbPoints = 0;
  if (fileExistsAndNonEmpty(paths.keybindingsPath)) {
    const kbData = safeReadJson(paths.keybindingsPath);
    const bindings = Array.isArray(kbData) ? kbData : Object.keys(kbData || {});
    kbPoints = bindings.length > 3 ? 2 : 1;
  }
  signals.push({
    name: 'Keybindings customized',
    value: kbPoints === 0 ? 'not configured' : kbPoints === 1 ? 'basic' : 'well configured',
    points: kbPoints,
    maxPoints: 2,
    recommendation: kbPoints < 2
      ? 'Customize keybindings in ~/.claude/keybindings.json to speed up your most common actions.'
      : null,
  });

  // ── Signal 5: Plugin blocklist curation (0-1 pt) ────────────────────
  let blocklistPoints = 0;
  const blocklistData = safeReadJson(paths.blocklistPath);
  if (blocklistData && Array.isArray(blocklistData.plugins)) {
    const hasReasonedEntries = blocklistData.plugins.some(
      entry => entry && typeof entry.reason === 'string' && entry.reason.trim().length > 0
    );
    if (hasReasonedEntries) blocklistPoints = 1;
  }
  signals.push({
    name: 'Plugin blocklist curation',
    value: blocklistPoints === 1 ? 'curated with reasons' : 'not curated',
    points: blocklistPoints,
    maxPoints: 1,
    recommendation: blocklistPoints === 0
      ? 'Curate your plugin blocklist with reasons — it shows intentional tool management and prevents noisy or risky plugins from activating.'
      : null,
  });

  // ── Signal 6: Launch configs (0-2 pts) ──────────────────────────────
  let launchCount = 0;
  const gitRoots = paths.gitScanRoots || [];
  for (const root of gitRoots) {
    const launchPath = path.join(root, '.claude', 'launch.json');
    if (fileExistsAndNonEmpty(launchPath)) {
      launchCount++;
    }
  }
  let launchPoints = 0;
  if (launchCount >= 2) launchPoints = 2;
  else if (launchCount >= 1) launchPoints = 1;
  signals.push({
    name: 'Launch configs',
    value: `${launchCount} repos with .claude/launch.json`,
    points: launchPoints,
    maxPoints: 2,
    recommendation: launchCount === 0
      ? 'Add .claude/launch.json to your projects so Claude can spin up dev servers for preview and testing.'
      : null,
  });

  // ── Signal 7: Strategic plugin bonus (0-2 pts) ──────────────────────
  // Plugin keys are like "code-review@claude-plugins-official" — match by partial name
  const enabledKeys = Object.keys(enabledPlugins).filter(k => enabledPlugins[k] === true);
  const strategicCount = STRATEGIC_PLUGINS.filter(sp =>
    enabledKeys.some(ek => ek.toLowerCase().includes(sp))
  ).length;
  const missingStrategic = STRATEGIC_PLUGINS.filter(sp =>
    !enabledKeys.some(ek => ek.toLowerCase().includes(sp))
  );
  let strategicPoints = 0;
  if (strategicCount >= 3) strategicPoints = 2;
  else if (strategicCount >= 1) strategicPoints = 1;
  signals.push({
    name: 'Strategic plugin bonus',
    value: `${strategicCount}/${STRATEGIC_PLUGINS.length} high-value plugins`,
    points: strategicPoints,
    maxPoints: 2,
    recommendation: strategicCount < 3
      ? `Enable high-value plugins for deeper integration: ${missingStrategic.join(', ')}.`
      : null,
  });

  // ── Total ───────────────────────────────────────────────────────────
  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const score = clamp(rawScore, 0, 20);

  return {
    dimension: 'Tool Fluency',
    score,
    maxScore: 20,
    signals,
  };
}

module.exports = { scan };
