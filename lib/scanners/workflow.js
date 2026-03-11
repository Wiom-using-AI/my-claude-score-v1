'use strict';

const { safeReadJson, safeReaddir, countFiles, lineCount, listFiles, daysAgo, fileExistsAndNonEmpty, dirExists } = require('../utils');
const path = require('path');
const fs = require('fs');

/**
 * Dimension 3: Workflow Maturity (0-20 points)
 *
 * Measures how deeply a user has adopted Claude Code's orchestration
 * features — custom agents, team/swarm coordination, planning artifacts,
 * agent memory, and todo tracking.
 */
function scan(paths) {
  const signals = [];

  signals.push(scanCustomAgents(paths));
  signals.push(scanAgentDepth(paths));
  signals.push(scanTeamUsage(paths));
  signals.push(scanTeamComplexity(paths));
  signals.push(scanActivePlans(paths));
  signals.push(scanAgentMemory(paths));
  signals.push(scanTodoUsage(paths));

  // Meta-signal: workflow explorer bonus (requires basic plan + todo usage)
  signals.push(scanWorkflowExplorer(signals));

  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const score = Math.max(0, Math.min(20, rawScore));

  return {
    dimension: 'Workflow Maturity',
    score,
    maxScore: 20,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Signal 1: Custom agents (0-4 pts)
// ---------------------------------------------------------------------------
function scanCustomAgents(paths) {
  const count = countFiles(paths.agentsDir, '.md');
  let points;
  if (count >= 4) points = 4;
  else if (count === 3) points = 3;
  else if (count === 2) points = 2;
  else if (count === 1) points = 1;
  else points = 0;

  let recommendation;
  if (points === 0) {
    recommendation = 'Create your first custom agent in ~/.claude/agents/ to automate repetitive tasks like code review, test writing, or documentation.';
  } else if (points < 3) {
    recommendation = 'Add more specialized agents \u2014 consider agents for debugging, refactoring, or domain-specific workflows.';
  } else if (points < 4) {
    recommendation = 'You have a solid agent library. Consider adding one more niche agent for edge-case workflows.';
  } else {
    recommendation = 'Excellent agent coverage. Keep agent definitions up to date as your workflow evolves.';
  }

  return {
    name: 'Custom agents',
    value: count,
    points,
    maxPoints: 4,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Signal 2: Agent depth (0-3 pts)
// Deep agent prompts directly improve output quality — high impact.
// ---------------------------------------------------------------------------
function scanAgentDepth(paths) {
  const files = listFiles(paths.agentsDir, '.md');
  let avgLines = 0;

  if (files.length > 0) {
    const totalLines = files.reduce((sum, f) => sum + lineCount(f), 0);
    avgLines = Math.round(totalLines / files.length);
  }

  let points;
  if (files.length === 0) points = 0;
  else if (avgLines >= 100) points = 3;
  else if (avgLines >= 60) points = 2;
  else if (avgLines >= 30) points = 1;
  else points = 0;

  let recommendation;
  if (files.length === 0) {
    recommendation = 'No agents found. Create detailed agent definitions with clear system prompts, constraints, and example outputs.';
  } else if (points < 1) {
    recommendation = `Agents average ${avgLines} lines \u2014 add more detailed instructions, examples, and edge-case handling to improve agent reliability.`;
  } else if (points < 2) {
    recommendation = `Good start at ${avgLines} avg lines. Add example interactions and constraints to push past 60 lines.`;
  } else if (points < 3) {
    recommendation = `Solid detail at ${avgLines} avg lines. Consider adding failure-mode guidance and edge-case handling to push past 100 lines.`;
  } else {
    recommendation = `Well-crafted agents averaging ${avgLines} lines. Review periodically to prune outdated instructions.`;
  }

  return {
    name: 'Agent depth',
    value: avgLines,
    points,
    maxPoints: 3,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Signal 3: Team/swarm usage (0-3 pts)
// ---------------------------------------------------------------------------
function scanTeamUsage(paths) {
  const teamCount = countTeamDirs(paths.teamsDir);

  let points;
  if (teamCount >= 3) points = 3;
  else if (teamCount === 2) points = 2;
  else if (teamCount === 1) points = 1;
  else points = 0;

  let recommendation;
  if (points === 0) {
    recommendation = 'Try creating a team with TeamCreate to coordinate multiple agents on complex tasks like full-stack features or large refactors.';
  } else if (points < 3) {
    recommendation = `${teamCount} team(s) found. Experiment with swarms for parallel workloads \u2014 e.g., one agent researches while another implements.`;
  } else {
    recommendation = 'Strong team adoption. Make sure to clean up stale team configs after projects wrap up.';
  }

  return {
    name: 'Team/swarm usage',
    value: teamCount,
    points,
    maxPoints: 3,
    recommendation,
  };
}

/**
 * List subdirectories of teamsDir that contain a config.json.
 */
function countTeamDirs(teamsDir) {
  if (!dirExists(teamsDir)) return 0;
  const entries = safeReaddir(teamsDir);
  let count = 0;
  for (const entry of entries) {
    const configPath = path.join(teamsDir, entry, 'config.json');
    if (fileExistsAndNonEmpty(configPath)) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Signal 4: Team complexity (0-1 pt) — reduced from 0-2
// ---------------------------------------------------------------------------
function scanTeamComplexity(paths) {
  const maxMembers = getMaxTeamMembers(paths.teamsDir);

  let points;
  if (maxMembers >= 3) points = 1;
  else points = 0;

  let recommendation;
  if (maxMembers === 0) {
    recommendation = 'No team configurations detected. When you create teams, aim for 3+ specialized members for meaningful coordination.';
  } else if (points === 0) {
    recommendation = `Largest team has ${maxMembers} member(s). Add more specialized roles (researcher, tester, implementer) to increase team effectiveness.`;
  } else {
    recommendation = `Team with ${maxMembers} members shows good coordination. Ensure clear task boundaries to avoid duplicate work across agents.`;
  }

  return {
    name: 'Team complexity',
    value: maxMembers,
    points,
    maxPoints: 1,
    recommendation,
  };
}

/**
 * Find the maximum members array length across all team config.json files.
 */
function getMaxTeamMembers(teamsDir) {
  if (!dirExists(teamsDir)) return 0;
  const entries = safeReaddir(teamsDir);
  let max = 0;
  for (const entry of entries) {
    const configPath = path.join(teamsDir, entry, 'config.json');
    const config = safeReadJson(configPath);
    if (config && Array.isArray(config.members)) {
      max = Math.max(max, config.members.length);
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Signal 5: Active plans (0-3 pts)
// ---------------------------------------------------------------------------
function scanActivePlans(paths) {
  const allPlans = listFiles(paths.plansDir, '.md');
  const totalCount = allPlans.length;

  let activeCount = 0;
  for (const filePath of allPlans) {
    if (daysAgo(filePath) <= 14) {
      activeCount++;
    }
  }

  let points;
  if (activeCount >= 6 || totalCount >= 10) points = 3;
  else if (activeCount >= 3) points = 2;
  else if (activeCount >= 1) points = 1;
  else points = 0;

  let recommendation;
  if (points === 0) {
    recommendation = 'No active plans found. Use plans to break complex projects into phases \u2014 Claude can reference them across sessions.';
  } else if (points === 1) {
    recommendation = `${activeCount} active plan(s). Create plans for each major initiative to maintain context across long-running work.`;
  } else if (points === 2) {
    recommendation = `${activeCount} active plans \u2014 good planning discipline. Consider archiving completed plans to keep the directory focused.`;
  } else {
    recommendation = `Strong planning culture with ${activeCount} active and ${totalCount} total plans. Review older plans periodically.`;
  }

  return {
    name: 'Active plans',
    value: `${activeCount} active / ${totalCount} total`,
    points,
    maxPoints: 3,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Signal 6: Agent memory populated (0-2 pts)
// ---------------------------------------------------------------------------
function scanAgentMemory(paths) {
  const memoryDir = paths.agentMemoryDir;
  let nonEmptyCount = 0;

  if (dirExists(memoryDir)) {
    const entries = safeReaddir(memoryDir);
    for (const entry of entries) {
      const fullPath = path.join(memoryDir, entry);
      if (fileExistsAndNonEmpty(fullPath)) {
        nonEmptyCount++;
      }
    }
  }

  let points;
  if (nonEmptyCount >= 3) points = 2;
  else if (nonEmptyCount >= 1) points = 1;
  else points = 0;

  let recommendation;
  if (points === 0) {
    recommendation = 'Agent memory is empty. Let agents accumulate learnings across sessions \u2014 this improves their accuracy over time.';
  } else if (points === 1) {
    recommendation = `${nonEmptyCount} memory file(s) found. Encourage more agents to persist context for better continuity across conversations.`;
  } else {
    recommendation = `${nonEmptyCount} memory files populated. Audit periodically to prune stale or irrelevant memories.`;
  }

  return {
    name: 'Agent memory populated',
    value: nonEmptyCount,
    points,
    maxPoints: 2,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// Signal 7: Todo usage (0-3 pts)
// ---------------------------------------------------------------------------
function scanTodoUsage(paths) {
  const substantialCount = countSubstantialTodos(paths.todosDir);

  let points;
  if (substantialCount >= 21) points = 3;
  else if (substantialCount >= 6) points = 2;
  else if (substantialCount >= 1) points = 1;
  else points = 0;

  let recommendation;
  if (points === 0) {
    recommendation = 'No todo artifacts found. Use TodoWrite to track multi-step tasks \u2014 it helps Claude maintain context and show progress.';
  } else if (points === 1) {
    recommendation = `${substantialCount} todo file(s). Use todos consistently for complex tasks to build a searchable history of completed work.`;
  } else if (points === 2) {
    recommendation = `${substantialCount} todo files \u2014 solid usage. Consider organizing by project or date for easier reference.`;
  } else {
    recommendation = `Heavy todo adoption (${substantialCount} files). Great for audit trails and resuming interrupted work.`;
  }

  return {
    name: 'Todo usage',
    value: substantialCount,
    points,
    maxPoints: 3,
    recommendation,
  };
}

/**
 * Count .json files in todosDir that are larger than 10 bytes
 * (filters out empty `[]` placeholder files).
 */
function countSubstantialTodos(todosDir) {
  if (!dirExists(todosDir)) return 0;
  const entries = safeReaddir(todosDir);
  let count = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const fullPath = path.join(todosDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size > 10) {
        count++;
      }
    } catch {
      // skip unreadable files
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Signal 8: Workflow explorer bonus (0-1 pt)
// Derivative meta-signal — awards a point for using both plans and todos.
// Low direct impact (just checks if other signals are active).
// ---------------------------------------------------------------------------
function scanWorkflowExplorer(otherSignals) {
  const signal = {
    name: 'Workflow explorer',
    value: 'Not enough workflow features used',
    points: 0,
    maxPoints: 1,
    recommendation: 'Use both plans and todos in your Claude Code sessions to unlock the workflow explorer bonus',
  };

  // Find the plans and todos signals from the already-computed list
  const plansSignal = otherSignals.find(s => s.name === 'Active plans');
  const todosSignal = otherSignals.find(s => s.name === 'Todo usage');

  const hasPlans = plansSignal && plansSignal.points >= 1;
  const hasTodos = todosSignal && todosSignal.points >= 1;

  if (hasPlans && hasTodos) {
    signal.points = 1;
    signal.value = 'Plans + Todos both active';
    signal.recommendation = 'Great workflow coverage! You are using Claude Code\'s built-in planning and tracking features.';
  } else {
    signal.value = hasPlans ? 'Plans active, no todos' : hasTodos ? 'Todos active, no plans' : 'Neither plans nor todos active';
    signal.recommendation = hasPlans
      ? 'Start using todos alongside plans to track task-level progress within your projects'
      : hasTodos
        ? 'Create plans to complement your todo usage \u2014 plans help maintain context across sessions'
        : 'Use both plans and todos in your Claude Code sessions to unlock the workflow explorer bonus';
  }

  return signal;
}

module.exports = { scan };
