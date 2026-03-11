#!/usr/bin/env node
'use strict';

const { parseArgs } = require('util');
const { resolve } = require('./lib/resolve');
const { computeScore } = require('./lib/scoring');
const { classifyTier, resolveArchetype } = require('./lib/tiers');
const { render } = require('./lib/renderer');
const { renderBadge } = require('./lib/badge-renderer');

// ── Parse CLI flags ─────────────────────────────────────────────────
const options = {
  badge:   { type: 'boolean', default: false },
  json:    { type: 'boolean', default: false },
  verbose: { type: 'boolean', default: false },
  path:    { type: 'string',  default: '' },
  help:    { type: 'boolean', short: 'h', default: false },
};

let flags;
try {
  const parsed = parseArgs({ options, allowPositionals: false });
  flags = parsed.values;
} catch (err) {
  console.error(`Error: ${err.message}`);
  console.error('Run with --help for usage information.');
  process.exit(1);
}

if (flags.help) {
  console.log(`
  my-claude-score — Claude Code Proficiency Score

  Usage:
    node my-claude-score.js              Full report
    node my-claude-score.js --badge      Compact shareable badge
    node my-claude-score.js --json       JSON output for piping
    node my-claude-score.js --verbose    Every signal explained
    node my-claude-score.js --path DIR   Scan specific dir for git repos

  Flags:
    --badge      Compact badge output (screenshot-friendly)
    --json       Machine-readable JSON output
    --verbose    Show every signal with name, value, and points
    --path DIR   Override git scan root directory
    -h, --help   Show this help message
`);
  process.exit(0);
}

// ── Resolve paths ───────────────────────────────────────────────────
const paths = resolve(flags.path || null);

// ── Run all 5 scanners ──────────────────────────────────────────────
const scanners = [
  './lib/scanners/config',
  './lib/scanners/tools',
  './lib/scanners/workflow',
  './lib/scanners/automation',
  './lib/scanners/knowledge',
];

const dimensionResults = [];
for (const scannerPath of scanners) {
  try {
    const { scan } = require(scannerPath);
    dimensionResults.push(scan(paths));
  } catch (err) {
    // If a scanner completely fails, produce a zero-score placeholder
    const name = scannerPath.split('/').pop();
    dimensionResults.push({
      dimension: name,
      score: 0,
      maxScore: 20,
      signals: [{
        name: `${name} scanner error`,
        value: err.message || 'unknown error',
        points: 0,
        maxPoints: 20,
        recommendation: `Fix the ${name} scanner or report this issue.`,
      }],
    });
  }
}

// ── Compute score, tier, archetype ──────────────────────────────────
const scoring = computeScore(dimensionResults);
const tier = classifyTier(scoring.totalScore, scoring.dimensions);
const archetype = resolveArchetype(scoring.dimensions, tier);

// ── Output ──────────────────────────────────────────────────────────
if (flags.json) {
  const output = {
    totalScore: scoring.totalScore,
    maxScore: scoring.maxScore,
    tier: tier.name,
    tierEmoji: tier.emoji,
    archetype,
    flavor: tier.flavor,
    dimensions: scoring.dimensions.map(d => ({
      dimension: d.dimension,
      score: d.score,
      maxScore: d.maxScore,
      signals: d.signals,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
} else if (flags.badge) {
  console.log(renderBadge(scoring, tier, archetype));
} else {
  console.log(render(scoring, tier, archetype, paths, flags.verbose));
}
