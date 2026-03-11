'use strict';

const { style, fg, bg, visibleLength, padEnd, padStart, truncate } = require('./ansi');

// ── Box-drawing characters ──────────────────────────────────────────
const BOX = {
  tl: '\u256D', tr: '\u256E', bl: '\u2570', br: '\u256F',
  h: '\u2500', v: '\u2502',
  ltee: '\u251C', rtee: '\u2524',
};
const WIDTH = 62;

// ── Color coding by score ───────────────────────────────────────────
function scoreColor(score, max) {
  const pct = score / max;
  if (pct >= 0.8)  return fg.brightGreen;
  if (pct >= 0.55) return fg.yellow;
  if (pct >= 0.3)  return fg.orange;
  return fg.red;
}

function tierColor(tierName) {
  const map = {
    Sage: fg.brightGreen,
    Virtuoso: fg.brightCyan,
    Artisan: fg.yellow,
    Craftsperson: fg.orange,
    Apprentice: fg.red,
  };
  return map[tierName] || fg.white;
}

// ── Progress bar ────────────────────────────────────────────────────
function progressBar(score, max, width = 20) {
  const filled = Math.round((score / max) * width);
  const empty = width - filled;
  const color = scoreColor(score, max);
  const bar = color('\u2588'.repeat(filled)) + fg.gray('\u2591'.repeat(empty));
  return bar;
}

// ── Horizontal rule ─────────────────────────────────────────────────
function hRule() {
  return fg.gray(BOX.ltee + BOX.h.repeat(WIDTH - 2) + BOX.rtee);
}

function topBorder() {
  return fg.gray(BOX.tl + BOX.h.repeat(WIDTH - 2) + BOX.tr);
}

function bottomBorder() {
  return fg.gray(BOX.bl + BOX.h.repeat(WIDTH - 2) + BOX.br);
}

function line(content) {
  const vbar = fg.gray(BOX.v);
  // Truncate content that would overflow the box, then pad to fill
  const safe = truncate(content, WIDTH - 4);
  const inner = padEnd(safe, WIDTH - 4);
  return `${vbar} ${inner} ${vbar}`;
}

function emptyLine() {
  return line('');
}

// ── Dimension short names ───────────────────────────────────────────
const SHORT_NAMES = {
  'Configuration Mastery': 'Config',
  'Tool Fluency':          'Tools',
  'Workflow Maturity':     'Workflow',
  'Automation & Git':      'Automation',
  'Knowledge & Security':  'Knowledge',
};

// ── Next-steps recommendation lookup ────────────────────────────────
const RECOMMENDATIONS = {
  'Rules files exist':          'Create rules files in ~/.claude/rules/ to guide Claude',
  'Rules depth':                'Add depth to your rules files (aim for 1000+ words total)',
  'Rules domain-specificity':   'Add domain keywords to rules (security, testing, deploy...)',
  'Project-level CLAUDE.md':    'Add CLAUDE.md to your project repos',
  'Settings customization':     'Customize settings.json with hooks, MCP servers, env vars',
  'Custom permissions':         'Configure allowedTools / deniedTools for fine-grained control',
  'MCP servers configured':     'Connect more MCP servers (GitHub, Slack, filesystem...)',
  'Plugins enabled':            'Enable more plugins for specialized capabilities',
  'Custom slash commands':      'Create slash commands in ~/.claude/commands/',
  'Keybindings customized':     'Customize keybindings in ~/.claude/keybindings.json',
  'Plugin blocklist curation':  'Curate your plugin blocklist with reasons',
  'Launch configs':             'Add .claude/launch.json to projects for dev server previews',
  'Strategic plugin bonus':     'Enable high-value plugins: security-guidance, code-review, LSPs',
  'Custom agents':              'Create custom agents in ~/.claude/agents/ for specialized tasks',
  'Agent depth':                'Write deeper agent prompts (aim for 100+ lines each)',
  'Team/swarm usage':           'Use agent teams for complex multi-step tasks',
  'Team complexity':            'Build teams with 5+ specialized members',
  'Active plans':               'Use plan mode more frequently for complex implementations',
  'Agent memory populated':     'Populate agent memory for persistent context',
  'Todo usage':                 'Use the todo system to track complex tasks',
  'Claude co-authored commits': 'Let Claude co-author commits with proper attribution',
  'Commit message quality':     'Aim for 40-72 character commit subjects',
  'Semantic commit prefixes':   'Use feat:/fix:/refactor: prefixes for cleaner git history',
  'Usage activity':             'Use Claude Code more regularly across sessions',
  'Model diversity':            'Try different models (opus, sonnet, haiku) for different tasks',
  'Hooks configured':           'Set up hooks in settings.json for automated workflows',
  'Security rules file':        'Create a security.md rules file with credential policies',
  'No hardcoded secrets':       'Keep your .claude/ directory clean of hardcoded secrets',
  'Centralized credential references': 'Reference .env and credential policies in your rules',
  'Secrets manager MCP':        'Connect a secrets manager MCP (wiom-secrets, 1password, etc.)',
  'Plugin blocklist with reasons': 'Add reasons to your plugin blocklist entries',
  'Security-adjacent plugins':  'Enable security-guidance, code-review, code-simplifier plugins',
};

// ── Main render function ────────────────────────────────────────────
/**
 * Render the full ANSI report.
 * @param {{ dimensions, totalScore, maxScore }} scoring
 * @param {{ name, emoji, flavor }} tier
 * @param {string} archetype
 * @param {{ statsPath }} paths
 * @param {boolean} verbose
 * @returns {string}
 */
function render(scoring, tier, archetype, paths, verbose = false) {
  const lines = [];

  // ── Header ──────────────────────────────────────────────────────
  lines.push('');
  lines.push(topBorder());
  lines.push(emptyLine());

  const titleStr = style.bold('  my-claude-score');
  lines.push(line(titleStr));
  lines.push(emptyLine());

  const tierStr = `  ${tier.emoji}  ${tierColor(tier.name)(style.bold(tier.name))}  ${fg.gray('\u2502')}  ${fg.brightWhite(style.bold(String(scoring.totalScore)))}${fg.gray('/' + scoring.maxScore)}`;
  lines.push(line(tierStr));

  const archeStr = `  ${fg.cyan(archetype)}`;
  lines.push(line(archeStr));
  lines.push(emptyLine());

  const flavorStr = `  ${fg.gray(tier.flavor)}`;
  lines.push(line(flavorStr));

  lines.push(hRule());
  lines.push(emptyLine());

  // ── Dimension bars ──────────────────────────────────────────────
  const labelWidth = 13;
  for (const dim of scoring.dimensions) {
    const shortName = SHORT_NAMES[dim.dimension] || dim.dimension;
    const label = padEnd(`  ${shortName}`, labelWidth);
    const bar = progressBar(dim.score, dim.maxScore, 20);
    const scoreStr = scoreColor(dim.score, dim.maxScore)(
      padStart(String(dim.score), 2)
    );
    const maxStr = fg.gray(`/${dim.maxScore}`);

    lines.push(line(`${label} ${bar}  ${scoreStr}${maxStr}`));

    // Verbose mode: show every signal
    if (verbose) {
      for (const sig of dim.signals) {
        const sigScore = scoreColor(sig.points, sig.maxPoints)(
          `${sig.points}/${sig.maxPoints}`
        );
        const sigName = fg.gray(`    ${sig.name}`);
        const sigVal = fg.gray(` (${sig.value})`);
        lines.push(line(`${sigName}${sigVal}  ${sigScore}`));
      }
      lines.push(emptyLine());
    }
  }

  if (!verbose) lines.push(emptyLine());

  // ── Strengths ───────────────────────────────────────────────────
  lines.push(hRule());
  lines.push(emptyLine());
  lines.push(line(`  ${style.bold(fg.brightGreen('\u2726 Strengths'))}`));
  lines.push(emptyLine());

  const allSignals = scoring.dimensions.flatMap(d => d.signals);
  const strengths = [...allSignals]
    .filter(s => s.maxPoints > 0 && s.points > 0)
    .sort((a, b) => (b.points / b.maxPoints) - (a.points / a.maxPoints))
    .slice(0, 3);

  if (strengths.length === 0) {
    lines.push(line(`  ${fg.gray('No strengths yet \u2014 start using Claude Code!')}`));
  } else {
    for (const s of strengths) {
      const pct = Math.round((s.points / s.maxPoints) * 100);
      lines.push(line(`  ${fg.green('\u221A')} ${s.name} ${fg.gray(`(${s.points}/${s.maxPoints} \u2014 ${pct}%)`)}`));
    }
  }

  // ── Next Steps ──────────────────────────────────────────────────
  lines.push(emptyLine());
  lines.push(hRule());
  lines.push(emptyLine());
  lines.push(line(`  ${style.bold(fg.yellow('>> Next Steps'))}`));
  lines.push(emptyLine());

  const gaps = [...allSignals]
    .filter(s => s.maxPoints > 0 && s.points < s.maxPoints)
    .sort((a, b) => (b.maxPoints - b.points) - (a.maxPoints - a.points))
    .slice(0, 3);

  if (gaps.length === 0) {
    lines.push(line(`  ${fg.brightGreen('Perfect score! You have mastered Claude Code.')}`));
  } else {
    for (const g of gaps) {
      const gain = g.maxPoints - g.points;
      const rec = g.recommendation || RECOMMENDATIONS[g.name] || `Improve ${g.name}`;
      lines.push(line(`  ${fg.yellow('\u25B8')} ${rec} ${fg.gray(`(+${gain} pts)`)}`));
    }
  }

  // ── Stats footer ────────────────────────────────────────────────
  lines.push(emptyLine());
  lines.push(hRule());
  lines.push(emptyLine());

  const stats = collectStats(scoring, paths);
  lines.push(line(`  ${fg.gray(stats)}`));

  lines.push(emptyLine());
  lines.push(bottomBorder());
  lines.push('');

  return lines.join('\n');
}

function collectStats(scoring, paths) {
  const parts = [];
  const safeReadJson = require('./utils').safeReadJson;

  // Count rules files
  const rulesSignal = findSignal(scoring, 'Rules files exist');
  if (rulesSignal) parts.push(`Rules: ${extractNumber(rulesSignal.value)}`);

  // Count agents
  const agentSignal = findSignal(scoring, 'Custom agents');
  if (agentSignal) parts.push(`Agents: ${extractNumber(agentSignal.value)}`);

  // Count plans
  const planSignal = findSignal(scoring, 'Active plans');
  if (planSignal) parts.push(`Plans: ${extractNumber(planSignal.value)}`);

  // MCP servers
  const mcpSignal = findSignal(scoring, 'MCP servers configured');
  if (mcpSignal) parts.push(`MCP: ${mcpSignal.value}`);

  // Usage stats
  const statsData = safeReadJson(paths.statsPath);
  if (statsData) {
    if (statsData.totalMessages) parts.push(`Msgs: ${statsData.totalMessages.toLocaleString()}`);
    const daysActive = Array.isArray(statsData.dailyActivity) ? statsData.dailyActivity.length : 0;
    if (daysActive) parts.push(`Days: ${daysActive}`);
  }

  return parts.join('  \u2502  ');
}

function findSignal(scoring, name) {
  for (const dim of scoring.dimensions) {
    for (const sig of dim.signals) {
      if (sig.name === name) return sig;
    }
  }
  return null;
}

function extractNumber(val) {
  if (typeof val === 'number') return val;
  const m = String(val).match(/^(\d+)/);
  return m ? m[1] : val;
}

module.exports = { render };
