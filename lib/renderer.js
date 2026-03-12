'use strict';

const { style, fg, bg, visibleLength, padEnd, padStart, truncate } = require('./ansi');

// ── Box-drawing characters ──────────────────────────────────────────
const BOX = {
  tl: '\u256D', tr: '\u256E', bl: '\u2570', br: '\u256F',
  h: '\u2500', v: '\u2502',
  ltee: '\u251C', rtee: '\u2524',
};
const WIDTH = 76;

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
    Master: fg.brightGreen,
    Pro: fg.brightCyan,
    Skilled: fg.yellow,
    Explorer: fg.orange,
    Beginner: fg.red,
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

// ── Word-wrap plain text into multiple box lines ────────────────────
// indent = number of leading spaces for continuation lines
function wrapLines(text, indent = 4) {
  const maxW = WIDTH - 4 - 2; // usable chars inside box (subtract box + padding)
  if (text.length <= maxW) return [line(`  ${text}`)];

  const words = text.split(' ');
  const result = [];
  let current = '';
  const prefix = ' '.repeat(indent);
  let isFirst = true;

  for (const word of words) {
    const lead = isFirst ? '  ' : prefix;
    const test = current ? `${current} ${word}` : `${lead}${word}`;
    if (test.length > maxW && current) {
      result.push(line(current));
      current = `${prefix}${word}`;
      isFirst = false;
    } else {
      current = test;
    }
  }
  if (current) result.push(line(current));
  return result;
}

// ── Dimension short names ───────────────────────────────────────────
const SHORT_NAMES = {
  'Configuration Mastery': 'Config',
  'Tool Fluency':          'Tools',
  'Workflow Maturity':     'Workflow',
  'Automation & Git':      'Automation',
  'Knowledge & Security':  'Knowledge',
};

// ── Next-steps prioritization ───────────────────────────────────────
// impact: 1 = high (show first), 2 = medium, 3 = low (show last)
// minTier: minimum tier before this gets recommended
//   'Beginner' = show to everyone, 'Skilled' = only 41+, 'Pro' = only 61+
const SIGNAL_PRIORITY = {
  // High impact — fundamentals that improve every session
  'Project-level CLAUDE.md':    { impact: 1, minTier: 'Beginner' },
  'Rules quality':              { impact: 1, minTier: 'Beginner' },
  'Security rules file':        { impact: 1, minTier: 'Beginner' },
  'Active plans':               { impact: 1, minTier: 'Beginner' },
  'Plugins enabled':            { impact: 1, minTier: 'Beginner' },
  'MCP servers configured':     { impact: 1, minTier: 'Beginner' },
  'No hardcoded secrets':       { impact: 1, minTier: 'Beginner' },
  'Claude co-authored commits': { impact: 1, minTier: 'Beginner' },

  // Medium impact — useful once basics are covered
  'Custom slash commands':      { impact: 2, minTier: 'Explorer' },
  'Settings customization':     { impact: 2, minTier: 'Explorer' },
  'Usage activity':             { impact: 2, minTier: 'Explorer' },
  'Commit message quality':     { impact: 2, minTier: 'Explorer' },
  'Hooks configured':           { impact: 2, minTier: 'Explorer' },
  'Agent depth':                { impact: 2, minTier: 'Explorer' },
  'Todo usage':                 { impact: 2, minTier: 'Explorer' },
  'Strategic plugin bonus':     { impact: 2, minTier: 'Explorer' },
  'Skills available':           { impact: 2, minTier: 'Explorer' },
  'Centralized credential references': { impact: 2, minTier: 'Explorer' },
  'Security-adjacent plugins':  { impact: 2, minTier: 'Explorer' },
  'Custom agents':              { impact: 2, minTier: 'Explorer' },
  'Team/swarm usage':           { impact: 2, minTier: 'Explorer' },
  'Agent memory populated':     { impact: 2, minTier: 'Explorer' },

  // Advanced — suggest only to experienced users
  'Keybindings customized':     { impact: 3, minTier: 'Skilled' },
  'Launch configs':             { impact: 3, minTier: 'Skilled' },
  'Semantic commit prefixes':   { impact: 3, minTier: 'Skilled' },
  'Model diversity':            { impact: 3, minTier: 'Skilled' },
  'Plugin blocklist curation':  { impact: 3, minTier: 'Skilled' },
  'Plugin blocklist with reasons': { impact: 3, minTier: 'Skilled' },
  'Team complexity':            { impact: 3, minTier: 'Skilled' },
  'Workflow explorer':          { impact: 3, minTier: 'Skilled' },

  // Pro — requires technical knowledge
  'Custom permissions':         { impact: 3, minTier: 'Pro' },
  'Security awareness':         { impact: 3, minTier: 'Pro' },
};

// Tier rank for comparison (higher number = higher tier)
const TIER_RANK = {
  'Beginner': 0, 'Explorer': 1, 'Skilled': 2, 'Pro': 3, 'Master': 4,
};

// ── Next-steps: WHAT to do + WHY it helps ───────────────────────────
// Format: "What to do — why it helps you"
const RECOMMENDATIONS = {
  'Rules quality':
    'Add more rules files in ~/.claude/rules/ — Claude reads these before every response, so it follows your coding style and project conventions automatically',
  'Project-level CLAUDE.md':
    'Add CLAUDE.md to your project repos — gives Claude project-specific context so it writes code that fits your codebase instead of generic code',
  'Settings customization':
    'Customize more settings in settings.json — tailors Claude to your workflow so you spend less time repeating preferences',
  'Custom permissions':
    'Set allowedTools / deniedTools in settings.json — controls what Claude can and cannot do, so it does not accidentally run dangerous commands or modify wrong files',
  'MCP servers configured':
    'Connect more MCP servers (GitHub, Slack, etc.) — lets Claude directly interact with your tools instead of you copy-pasting between apps',
  'Plugins enabled':
    'Enable more plugins — gives Claude specialized capabilities like code review, security checks, and design tools',
  'Custom slash commands':
    'Create slash commands in ~/.claude/commands/ — saves your common prompts as shortcuts so you type /review instead of explaining what to do every time',
  'Keybindings customized':
    'Set up keybindings in ~/.claude/keybindings.json — keyboard shortcuts that save you mouse clicks on actions you repeat often',
  'Plugin blocklist curation':
    'Curate your plugin blocklist with reasons — prevents Claude from using plugins that do not work well for your use case',
  'Launch configs':
    'Add .claude/launch.json to your projects — Claude can auto-start your dev server and preview changes in the browser without you running commands manually',
  'Strategic plugin bonus':
    'Enable high-value plugins: security-guidance, code-review, LSPs — these catch bugs and security issues before they reach production',
  'Custom agents':
    'Create custom agents in ~/.claude/agents/ — reusable AI specialists (e.g., a debugger, reviewer, or deployer) that you can call by name for specific tasks',
  'Agent depth':
    'Write deeper agent prompts (100+ lines) — more detailed instructions mean agents make fewer mistakes and need less back-and-forth',
  'Team/swarm usage':
    'Use agent teams for complex tasks — multiple agents work in parallel (one researches while another codes), finishing faster than one agent alone',
  'Team complexity':
    'Build teams with more specialized members — like having a senior dev, QA, and architect working together instead of one person doing everything',
  'Active plans':
    'Use plan mode before complex implementations — Claude maps out the approach first so you can course-correct before it writes 500 lines in the wrong direction',
  'Agent memory populated':
    'Populate agent memory files — agents remember what worked and what failed across sessions, so they get better at your specific projects over time',
  'Todo usage':
    'Use the todo system for complex tasks — tracks what is done and what is left, so you can pause and resume without losing context',
  'Workflow explorer':
    'Use both plans and todos together — plans define what to build, todos track execution, giving you full visibility from idea to completion',
  'Claude co-authored commits':
    'Let Claude co-author more commits — builds a history of AI-assisted work, making it easy to trace which changes Claude helped with',
  'Commit message quality':
    'Aim for 40-72 character commit subjects — clear commit messages make your git history readable when you need to find or revert changes later',
  'Semantic commit prefixes':
    'Use feat:/fix:/refactor: prefixes — lets you auto-generate changelogs and instantly see what kind of change each commit introduced',
  'Usage activity':
    'Use Claude Code more regularly — the more you use it, the more it learns your patterns and the faster you get results',
  'Model diversity':
    'Try different models (opus for hard problems, haiku for quick tasks) — saves time and cost by matching the right model to the job',
  'Hooks configured':
    'Set up hooks in settings.json (lint on save, test before commit) — catches errors automatically so you do not push broken code',
  'Security rules file':
    'Create a security.md rules file — tells Claude your credential policies so it never accidentally logs API keys or commits secrets',
  'No hardcoded secrets':
    'Remove hardcoded secrets from ~/.claude/ files — prevents accidental exposure of API keys if you share configs or push to git',
  'Centralized credential references':
    'Reference .env and credential policies in your rules — Claude will use environment variables instead of hardcoding secrets in your code',
  'Plugin blocklist with reasons':
    'Add reasons to your plugin blocklist entries — documents why certain plugins are blocked so your team understands the decision',
  'Security-adjacent plugins':
    'Enable security-guidance, code-review, code-simplifier plugins — automated safety nets that catch vulnerabilities before they ship',
  'Security awareness':
    'Adopt more security practices — each layer of security reduces the chance of credentials leaking or unsafe code reaching production',
  'Skills available':
    'Enable plugins with skills (superpowers, figma, skill-creator) — skills are structured workflow templates for brainstorming, debugging, TDD, code review, and more, so Claude follows proven approaches instead of winging it',
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

  // Wrap flavor text if it's long
  const flavorWrapped = wrapPlainLines(tier.flavor, 2);
  for (const fl of flavorWrapped) {
    lines.push(line(`  ${fg.gray(fl)}`));
  }

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

  // ── Next Steps ────────────────────────────────────────────────
  lines.push(emptyLine());
  lines.push(hRule());
  lines.push(emptyLine());
  lines.push(line(`  ${style.bold(fg.yellow('>> Next Steps'))}`));
  lines.push(emptyLine());

  const userTierRank = TIER_RANK[tier.name] || 0;

  const gaps = [...allSignals]
    .filter(s => {
      if (s.maxPoints === 0 || s.points >= s.maxPoints) return false;
      // Gate: only show recommendations appropriate for user's tier
      const prio = SIGNAL_PRIORITY[s.name];
      if (prio) {
        const requiredRank = TIER_RANK[prio.minTier] || 0;
        if (userTierRank < requiredRank) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by: impact tier (1=high first) → point gap (bigger first)
      const prioA = (SIGNAL_PRIORITY[a.name] || { impact: 2 }).impact;
      const prioB = (SIGNAL_PRIORITY[b.name] || { impact: 2 }).impact;
      if (prioA !== prioB) return prioA - prioB;
      return (b.maxPoints - b.points) - (a.maxPoints - a.points);
    })
    .slice(0, 3);

  if (gaps.length === 0) {
    lines.push(line(`  ${fg.brightGreen('Perfect score! You have mastered Claude Code.')}`));
  } else {
    for (const g of gaps) {
      const gain = g.maxPoints - g.points;
      // Prefer the RECOMMENDATIONS map (has WHY), fall back to scanner text
      const fullRec = RECOMMENDATIONS[g.name] || g.recommendation || `Improve ${g.name}`;

      // Split on " — " to separate WHAT from WHY
      const dashIdx = fullRec.indexOf(' \u2014 ');
      let whatPart, whyPart;
      if (dashIdx >= 0) {
        whatPart = fullRec.slice(0, dashIdx);
        whyPart = fullRec.slice(dashIdx + 3); // skip " — "
      } else {
        whatPart = fullRec;
        whyPart = '';
      }

      // Line 1: ▸ What to do (+N pts)
      lines.push(line(`  ${fg.yellow('\u25B8')} ${whatPart} ${fg.gray(`(+${gain} pts)`)}`));

      // Line 2: Why it helps (gray, indented)
      if (whyPart) {
        const whyWrapped = wrapPlainLines(whyPart, 6);
        for (const wl of whyWrapped) {
          lines.push(line(`      ${fg.gray(wl)}`));
        }
      }
      lines.push(emptyLine());
    }
  }

  // ── Stats footer ──────────────────────────────────────────────
  lines.push(hRule());
  lines.push(emptyLine());

  const stats = collectStats(scoring, paths);
  lines.push(line(`  ${fg.gray(stats)}`));

  lines.push(emptyLine());
  lines.push(bottomBorder());
  lines.push('');

  return lines.join('\n');
}

/**
 * Wrap plain text into lines of maxW chars, returning an array of strings.
 */
function wrapPlainLines(text, indent = 0) {
  const maxW = WIDTH - 4 - 2 - indent; // usable width inside box minus indent
  if (text.length <= maxW) return [text];

  const words = text.split(' ');
  const result = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxW && current) {
      result.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) result.push(current);
  return result;
}

/**
 * Wrap a recommendation that has an ANSI prefix and suffix.
 * Line 1: "  ▸ First part of recommendation text... (+N pts)"
 * Line 2+: "    continuation of text"
 */
function wrapRecLine(prefix, text, suffix) {
  const maxW = WIDTH - 6; // usable plain-text chars (box + padding)
  // prefix visible length: "▸ " = 2 chars
  // suffix visible length varies but typically " (+N pts)" = ~9 chars
  const prefixLen = 2;
  const suffixText = suffix.replace(/\x1b\[[0-9;]*m/g, '');
  const suffixLen = suffixText.length;

  // If entire thing fits on one line
  if (prefixLen + text.length + suffixLen <= maxW) {
    return [line(`  ${prefix}${text}${suffix}`)];
  }

  // Split text into words and wrap
  const words = text.split(' ');
  const result = [];
  let current = '';
  const indent = '    '; // 4 spaces for continuation

  for (const word of words) {
    const isFirst = result.length === 0;
    const lineLimit = isFirst ? (maxW - prefixLen - suffixLen) : (maxW - indent.length);
    const test = current ? `${current} ${word}` : word;

    if (test.length > lineLimit && current) {
      if (isFirst) {
        result.push(line(`  ${prefix}${current}${suffix}`));
      } else {
        result.push(line(`  ${indent}${current}`));
      }
      current = word;
    } else {
      current = test;
    }
  }

  // Flush remaining
  if (current) {
    if (result.length === 0) {
      result.push(line(`  ${prefix}${current}${suffix}`));
    } else {
      result.push(line(`  ${indent}${current}`));
    }
  }

  return result;
}

function collectStats(scoring, paths) {
  const parts = [];
  const safeReadJson = require('./utils').safeReadJson;

  // MCP servers
  const mcpSignal = findSignal(scoring, 'MCP servers configured');
  if (mcpSignal) parts.push(`MCP servers: ${mcpSignal.value}`);

  // Count agents
  const agentSignal = findSignal(scoring, 'Custom agents');
  if (agentSignal) parts.push(`Agents: ${extractNumber(agentSignal.value)}`);

  // Usage stats
  const statsData = safeReadJson(paths.statsPath);
  if (statsData) {
    if (statsData.totalMessages) parts.push(`Messages: ${statsData.totalMessages.toLocaleString()}`);
    const daysActive = Array.isArray(statsData.dailyActivity) ? statsData.dailyActivity.length : 0;
    if (daysActive) parts.push(`Days active: ${daysActive}`);
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
