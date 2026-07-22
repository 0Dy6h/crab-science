import { describe, expect, it, vi } from 'vitest';
import type { ChangeEntry, Experience } from '@crab-science/shared';
import { CommandHandler } from '../../src/commands/handler.js';
import type { UseAgentReturn } from '../../src/hooks/use-agent.js';

function createAgent(overrides: Partial<UseAgentReturn> = {}): UseAgentReturn {
  return {
    messages: [],
    isProcessing: false,
    currentModel: 'claude-sonnet-4-20250514',
    currentProvider: 'anthropic',
    tokenUsage: { inputTokens: 0, outputTokens: 0, cost: 0 },
    skills: [{ name: 'literature-search', description: 'Search literature' }],
    extensions: [],
    sendMessage: vi.fn(),
    switchModel: vi.fn(),
    switchProvider: vi.fn(),
    clearSession: vi.fn(),
    loadSession: vi.fn(() => false),
    sessionList: [],
    refreshSessionList: vi.fn(),
    config: null,
    forkSession: vi.fn(() => null),
    rollbackSession: vi.fn(() => false),
    jumpToBranch: vi.fn(() => false),
    summarizeBranch: vi.fn(async () => null),
    getTree: vi.fn(() => null),
    getNodes: vi.fn(() => ({})),
    listBranches: vi.fn(() => []),
    getCurrentNodeId: vi.fn(() => ''),
    refreshExtensions: vi.fn(),
    getSkillHistory: vi.fn(() => []),
    refreshDisplay: vi.fn(),
    evolutionEvents: [],
    subagents: [],
    triggerEvolution: vi.fn(async () => undefined),
    getEvaluations: vi.fn(() => []),
    getDetectedPatterns: vi.fn(() => []),
    getRecentExperiences: vi.fn(() => []),
    getChangelog: vi.fn(() => []),
    getSubagentMetrics: vi.fn(() => null),
    submitRating: vi.fn(),
    ...overrides,
  } as UseAgentReturn;
}

const experiences: Experience[] = [
  {
    id: 'exp_1',
    timestamp: '2026-07-22T08:00:00.000Z',
    taskId: 'task_1',
    sessionId: 'sess_1',
    task: 'CRISPR literature search',
    skillUsed: 'literature-search',
    subagentUsed: null,
    outcome: 'success',
    duration: 1200,
    keyLearnings: ['Use expanded keywords for sparse CRISPR results'],
    tags: ['literature', 'crispr'],
    relatedExperiences: [],
  },
  {
    id: 'exp_2',
    timestamp: '2026-07-22T09:00:00.000Z',
    taskId: 'task_2',
    sessionId: 'sess_2',
    task: 'API retry strategy',
    skillUsed: 'literature-search',
    subagentUsed: null,
    outcome: 'partial',
    duration: 800,
    keyLearnings: ['Retry rate-limited APIs with a one second delay'],
    tags: ['api', 'retry'],
    relatedExperiences: [],
  },
];

const changelog: ChangeEntry[] = [
  {
    type: 'skill_optimize',
    target: 'literature-search',
    version: 4,
    description: 'Added expanded keyword guidance',
    commitHash: 'abcdef1234567890',
    timestamp: '2026-07-22T10:00:00.000Z',
  },
  {
    type: 'subagent_create',
    target: 'data-analyzer',
    version: 1,
    description: 'Created data analysis subagent',
    timestamp: '2026-07-22T11:00:00.000Z',
  },
];

describe('CommandHandler Phase 3 PRD command compatibility', () => {
  it('handles /knowledge by listing recent experiences', () => {
    const handler = new CommandHandler(
      createAgent({ getRecentExperiences: vi.fn(() => experiences) }),
    );

    const result = handler.handle('/knowledge');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('最近经验');
    expect(result.output).toContain('CRISPR literature search');
    expect(result.output).toContain('Use expanded keywords');
  });

  it('handles /knowledge search by filtering recent experiences', () => {
    const handler = new CommandHandler(
      createAgent({ getRecentExperiences: vi.fn(() => experiences) }),
    );

    const result = handler.handle('/knowledge search retry');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('知识搜索');
    expect(result.output).toContain('API retry strategy');
    expect(result.output).not.toContain('CRISPR literature search');
  });

  it('handles /versions by showing changelog entries for a skill', () => {
    const handler = new CommandHandler(
      createAgent({ getChangelog: vi.fn(() => changelog) }),
    );

    const result = handler.handle('/versions literature-search');

    expect(result.handled).toBe(true);
    expect(result.output).toContain('literature-search 版本历史');
    expect(result.output).toContain('v4');
    expect(result.output).toContain('Added expanded keyword guidance');
    expect(result.output).not.toContain('data-analyzer');
  });

  it('lists PRD command names in /help', () => {
    const handler = new CommandHandler(createAgent());

    const result = handler.handle('/help');

    expect(result.output).toContain('/knowledge');
    expect(result.output).toContain('/versions');
  });
});
