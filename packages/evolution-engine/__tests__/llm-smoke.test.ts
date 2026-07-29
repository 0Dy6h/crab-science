/**
 * LLM 冒烟测试 — 验证进化引擎三大 LLM 调用链路
 *
 * 测试分两层：
 * 1. Mock Pipeline 验证（始终运行）— 用 RecordingProvider 验证 prompt 构造 → model 传递 → 响应解析的完整链路
 * 2. 真实 LLM 冒烟测试（条件运行）— 当 DEEPSEEK_API_KEY 或 OPENAI_API_KEY 可用时，调用真实 API 验证输出质量
 *
 * 运行方式：
 *   pnpm vitest run llm-smoke          # 仅 mock 测试
 *   DEEPSEEK_API_KEY=sk-xxx pnpm vitest run llm-smoke  # 含真实 LLM 测试
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as os from 'os';

import { SkillOptimizer } from '../src/skill/skill-optimizer.js';
import { ExperienceExtractor } from '../src/knowledge/experience-extractor.js';
import { SubagentCreator } from '../src/subagent/subagent-creator.js';

import type {
  Session,
  TaskInfo,
  SkillEvaluationResult,
  SkillExecutionRecord,
  SkillMetrics,
  PatternMatch,
  TaskRecord,
  SessionNode,
  NodeMetadata,
  Experience,
} from '@crab-science/shared';
import type {
  LLMProvider,
  LLMOptions,
  StreamEvent,
  ModelInfo,
} from '@crab-science/llm-layer';

// ============================================================
// 环境检测：是否有真实 API Key
// ============================================================

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const HAS_REAL_LLM = DEEPSEEK_KEY.length > 10 || OPENAI_KEY.length > 10;

// 真实 LLM 测试使用较长超时（30s）
const REAL_LLM_TIMEOUT = 30_000;

// ============================================================
// RecordingProvider — 记录 LLM 调用参数，返回预设响应
// ============================================================

class RecordingProvider implements LLMProvider {
  readonly name: string;
  lastModel = '__unset__';
  lastOptions: LLMOptions | null = null;
  lastMessages: unknown[] | null = null;
  callCount = 0;

  constructor(
    name: string,
    private readonly response: string,
  ) {
    this.name = name;
  }

  async *complete(
    messages: Parameters<LLMProvider['complete']>[0],
    options: LLMOptions,
  ): AsyncGenerator<StreamEvent> {
    this.callCount++;
    this.lastModel = options.model;
    this.lastOptions = options;
    this.lastMessages = messages;

    yield { type: 'text_delta' as const, content: this.response };
    yield {
      type: 'message_end' as const,
      usage: { inputTokens: 100, outputTokens: 50, cost: 0.001 },
    };
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

// ============================================================
// 测试数据工厂
// ============================================================

/** 创建真实的 SkillMetricsRepository mock（带执行记录） */
function createMockSkillMetricsRepo(
  records: SkillExecutionRecord[] = [],
) {
  return {
    queryExecutions: vi.fn().mockReturnValue(records),
    insertExecution: vi.fn().mockReturnValue({ id: 'exec_mock', timestamp: new Date().toISOString() }),
    getOrCreateSkillMetricRecord: vi.fn().mockReturnValue({
      pendingValidation: false,
      versionCreatedAt: null,
      currentVersion: 1,
    }),
    getAllSkillNames: vi.fn().mockReturnValue(['test-skill']),
    getMetrics: vi.fn().mockReturnValue({
      skillName: 'test-skill',
      successRate: 0.5,
      avgDuration: 8000,
      usageCount: 10,
      userSatisfaction: 2.5,
      lastUsed: new Date().toISOString(),
      trend: 'declining',
    }),
  } as any;
}

/** 创建 SkillExecutionRecord 数组 */
function makeExecutionRecords(overrides?: Partial<SkillExecutionRecord>[]): SkillExecutionRecord[] {
  const base: SkillExecutionRecord[] = [
    {
      id: 'exec_1',
      skillName: 'data-analysis',
      timestamp: '2026-01-01T00:00:00Z',
      task: '分析销售数据并生成报告',
      steps: ['读取CSV', '清洗数据', '生成图表'],
      durationMs: 12000,
      status: 'success',
      tokenUsage: { inputTokens: 500, outputTokens: 300, cost: 0.01 },
      adopted: true,
      rating: 4,
      skillVersion: 1,
      sessionId: 's1',
    },
    {
      id: 'exec_2',
      skillName: 'data-analysis',
      timestamp: '2026-01-02T00:00:00Z',
      task: '分析销售数据',
      steps: ['读取CSV', '清洗数据'],
      durationMs: 15000,
      status: 'failed',
      error: 'CSV 文件格式错误: 缺少分隔符',
      tokenUsage: { inputTokens: 400, outputTokens: 200, cost: 0.008 },
      adopted: false,
      rating: 1,
      skillVersion: 1,
      sessionId: 's2',
    },
    {
      id: 'exec_3',
      skillName: 'data-analysis',
      timestamp: '2026-01-03T00:00:00Z',
      task: '生成月度报告',
      steps: ['读取CSV', '清洗数据'],
      durationMs: 18000,
      status: 'failed',
      error: 'CSV 文件格式错误: 缺少分隔符',
      tokenUsage: { inputTokens: 450, outputTokens: 250, cost: 0.009 },
      adopted: false,
      rating: 2,
      skillVersion: 1,
      sessionId: 's3',
    },
    {
      id: 'exec_4',
      skillName: 'data-analysis',
      timestamp: '2026-01-04T00:00:00Z',
      task: '分析用户行为数据',
      steps: ['读取CSV', '清洗数据', '生成图表', '导出PDF'],
      durationMs: 22000,
      status: 'partial',
      error: 'PDF 导出超时',
      tokenUsage: { inputTokens: 600, outputTokens: 400, cost: 0.015 },
      adopted: false,
      rating: 3,
      skillVersion: 1,
      sessionId: 's4',
    },
  ];
  if (overrides) {
    return base.map((r, i) => ({ ...r, ...overrides[i] }));
  }
  return base;
}

/** 创建 SkillEvaluationResult（需要优化的 Skill） */
function makeEvaluation(): SkillEvaluationResult {
  const metrics: SkillMetrics = {
    skillName: 'data-analysis',
    successRate: 0.5,
    avgDuration: 16750,
    usageCount: 4,
    userSatisfaction: 2.5,
    lastUsed: '2026-01-04T00:00:00Z',
    trend: 'declining',
  };
  return {
    skillName: 'data-analysis',
    metrics,
    needsOptimization: true,
    triggerReasons: [
      '成功率 50% 低于阈值 70%',
      '用户满意度 2.5/5 低于阈值 3.5',
      '趋势: declining',
    ],
  };
}

/** 创建 Mock ExperienceRepository */
function createMockExperienceRepo() {
  const saved: Experience[] = [];
  return {
    insert: vi.fn((exp: Omit<Experience, 'id'>) => {
      const record = { ...exp, id: `exp_${saved.length + 1}` } as Experience;
      saved.push(record);
      return record;
    }),
    findById: vi.fn((id: string) => saved.find((e) => e.id === id) ?? null),
    findByTags: vi.fn(() => []),
    findBySkill: vi.fn(() => []),
    findByTaskKeywords: vi.fn(() => []),
    getRecent: vi.fn(() => saved.slice(-10)),
    getAll: vi.fn(() => saved),
    _saved: saved,
  } as any;
}

/** 创建 Mock KnowledgeGraph */
function createMockKnowledgeGraph() {
  return {
    buildEdgesForExperience: vi.fn(),
  } as any;
}

/** 创建 Mock GitManager */
function createMockGitManager() {
  return {
    commit: vi.fn().mockResolvedValue('mock-commit-hash'),
    log: vi.fn().mockResolvedValue([]),
    diff: vi.fn().mockResolvedValue(''),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn(),
  } as any;
}

/** 创建带执行路径的 Session */
function makeSession(): Session {
  const meta: NodeMetadata = {};
  const nodes: Record<string, SessionNode> = {};

  const root: SessionNode = {
    id: 'n1',
    parentId: null,
    type: 'user',
    content: '请帮我分析 sales.csv 的销售数据，生成一份月度报告',
    timestamp: '2026-01-01T10:00:00Z',
    childrenIds: ['n2'],
    metadata: meta,
  };

  const assistant: SessionNode = {
    id: 'n2',
    parentId: 'n1',
    type: 'assistant',
    content: '我来帮你分析销售数据。首先读取 CSV 文件，然后进行数据清洗和统计分析。',
    timestamp: '2026-01-01T10:00:05Z',
    childrenIds: ['n3'],
    metadata: meta,
  };

  const toolCall: SessionNode = {
    id: 'n3',
    parentId: 'n2',
    type: 'tool_call',
    content: '读取 CSV 文件',
    timestamp: '2026-01-01T10:00:10Z',
    childrenIds: ['n4'],
    metadata: { toolName: 'read_file', toolParams: { path: 'sales.csv' } },
  };

  const toolResult: SessionNode = {
    id: 'n4',
    parentId: 'n3',
    type: 'tool_result',
    content: '成功读取 1000 行销售数据，包含日期、产品、金额、地区等字段',
    timestamp: '2026-01-01T10:00:12Z',
    childrenIds: ['n5'],
    metadata: { toolResult: '1000 rows loaded', toolError: false },
  };

  const assistant2: SessionNode = {
    id: 'n5',
    parentId: 'n4',
    type: 'assistant',
    content: '数据已加载。现在进行统计分析，按月汇总销售额并生成图表。分析完成，1月销售额最高达50万，3月最低为20万。',
    timestamp: '2026-01-01T10:00:30Z',
    childrenIds: [],
    metadata: meta,
  };

  nodes.n1 = root;
  nodes.n2 = assistant;
  nodes.n3 = toolCall;
  nodes.n4 = toolResult;
  nodes.n5 = assistant2;

  return {
    id: 'session-smoke-test',
    nodes,
    rootId: 'n1',
    currentNodeId: 'n5',
    model: 'deepseek-chat',
    provider: 'deepseek',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:30Z',
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCost: 0.02,
    version: 2,
  };
}

/** 创建 TaskInfo */
function makeTaskInfo(): TaskInfo {
  return {
    task: '分析 sales.csv 的销售数据，生成月度报告',
    skillUsed: 'data-analysis',
    subagentUsed: null,
    outcome: 'success',
    duration: 30000,
    toolsUsed: ['read_file', 'bash'],
    sessionId: 'session-smoke-test',
  };
}

/** 创建 PatternMatch */
function makePatternMatch(): PatternMatch {
  const tasks: TaskRecord[] = [
    { taskId: 't1', task: '分析CSV数据并生成报告', toolsUsed: ['read_file', 'bash'], skillUsed: 'data-analysis', outcome: 'success', timestamp: '2026-01-01T00:00:00Z' },
    { taskId: 't2', task: '处理CSV文件输出统计', toolsUsed: ['read_file', 'bash'], skillUsed: 'data-analysis', outcome: 'success', timestamp: '2026-01-02T00:00:00Z' },
    { taskId: 't3', task: '分析Excel数据生成图表', toolsUsed: ['read_file', 'bash'], skillUsed: 'data-analysis', outcome: 'partial', timestamp: '2026-01-03T00:00:00Z' },
    { taskId: 't4', task: '清洗数据并导出报告', toolsUsed: ['read_file', 'bash'], skillUsed: 'data-analysis', outcome: 'success', timestamp: '2026-01-04T00:00:00Z' },
    { taskId: 't5', task: '分析用户行为数据', toolsUsed: ['read_file', 'bash'], skillUsed: 'data-analysis', outcome: 'success', timestamp: '2026-01-05T00:00:00Z' },
  ];
  return {
    signature: 'data-analysis+read_file+bash',
    matchingTasks: tasks,
    count: 5,
    suggestedName: 'data-analyst',
    suggestedDescription: '处理数据分析和报告生成的专家',
  };
}

// ============================================================
// Part 1: Mock Pipeline 验证（始终运行）
// ============================================================

describe('LLM 冒烟测试 — Mock Pipeline 验证', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = os.tmpdir();
  });

  // --- SkillOptimizer ---

  describe('SkillOptimizer pipeline', () => {
    it('prompt 构造 → LLM 调用 → JSON 解析 → 返回 OptimizationSuggestion', async () => {
      const mockResponse = JSON.stringify({
        severity: 'minor',
        section: '错误处理',
        suggestion: '在读取CSV前增加格式校验步骤，检测分隔符是否正确',
        rationale: 'CSV格式错误导致多次失败，增加前置校验可提前发现问题',
      });

      const provider = new RecordingProvider('mock', mockResponse);
      const repo = createMockSkillMetricsRepo(makeExecutionRecords());
      const optimizer = new SkillOptimizer(provider, repo, 'deepseek-chat', workDir);

      const suggestion = await optimizer.generateSuggestion(
        'data-analysis',
        makeEvaluation(),
      );

      // 1. LLM 被调用一次
      expect(provider.callCount).toBe(1);

      // 2. model 正确传递
      expect(provider.lastModel).toBe('deepseek-chat');

      // 3. systemPrompt 非空且包含角色定义
      expect(provider.lastOptions?.systemPrompt).toContain('Skill 优化专家');

      // 4. temperature 和 maxTokens 符合预期
      expect(provider.lastOptions?.temperature).toBe(0.3);
      expect(provider.lastOptions?.maxTokens).toBe(1024);

      // 5. 返回的 suggestion 结构正确
      expect(suggestion).not.toBeNull();
      expect(suggestion!.severity).toBe('minor');
      expect(suggestion!.section).toBe('错误处理');
      expect(suggestion!.suggestion).toContain('格式校验');
      expect(suggestion!.rationale).toContain('CSV格式错误');
      expect(suggestion!.skillName).toBe('data-analysis');
      expect(suggestion!.id).toMatch(/^sug_/);
    });

    it('prompt 中包含执行指标和失败模式', async () => {
      const provider = new RecordingProvider('mock', '{"severity":"minor","section":"x","suggestion":"y","rationale":"z"}');
      const repo = createMockSkillMetricsRepo(makeExecutionRecords());
      const optimizer = new SkillOptimizer(provider, repo, 'deepseek-chat', workDir);

      await optimizer.generateSuggestion('data-analysis', makeEvaluation());

      // 检查 prompt 内容
      const messages = provider.lastMessages as Array<{ role: string; content: string }>;
      const promptText = messages[0]?.content ?? '';

      // prompt 应包含关键指标
      expect(promptText).toContain('data-analysis');
      expect(promptText).toContain('成功率');
      expect(promptText).toContain('declining');
      // prompt 应包含触发原因
      expect(promptText).toContain('成功率 50%');
      // prompt 应包含执行记录
      expect(promptText).toContain('分析销售数据');
    });

    it('LLM 返回空字符串时返回 null', async () => {
      const provider = new RecordingProvider('mock', '');
      const repo = createMockSkillMetricsRepo(makeExecutionRecords());
      const optimizer = new SkillOptimizer(provider, repo, 'deepseek-chat', workDir);

      const result = await optimizer.generateSuggestion('data-analysis', makeEvaluation());
      expect(result).toBeNull();
    });

    it('LLM 返回非 JSON 文本时返回 null', async () => {
      const provider = new RecordingProvider('mock', '这不是一个JSON格式的响应');
      const repo = createMockSkillMetricsRepo(makeExecutionRecords());
      const optimizer = new SkillOptimizer(provider, repo, 'deepseek-chat', workDir);

      const result = await optimizer.generateSuggestion('data-analysis', makeEvaluation());
      expect(result).toBeNull();
    });
  });

  // --- ExperienceExtractor ---

  describe('ExperienceExtractor pipeline', () => {
    it('Session 执行路径 → LLM 分析 → 经验提取 → 入库', async () => {
      const mockResponse = JSON.stringify({
        keyLearnings: [
          'CSV读取后应检查分隔符格式',
          '月度销售额统计需要按日期分组聚合',
          '1月销售额最高，3月最低',
        ],
        tags: ['data-analysis', 'csv', 'sales-report', 'python'],
      });

      const provider = new RecordingProvider('mock', mockResponse);
      const expRepo = createMockExperienceRepo();
      const kg = createMockKnowledgeGraph();
      const extractor = new ExperienceExtractor(provider, expRepo, kg, 'deepseek-chat');

      const experience = await extractor.extract(makeSession(), makeTaskInfo());

      // 1. LLM 被调用
      expect(provider.callCount).toBe(1);
      expect(provider.lastModel).toBe('deepseek-chat');

      // 2. systemPrompt 正确
      expect(provider.lastOptions?.systemPrompt).toContain('经验提取专家');
      expect(provider.lastOptions?.temperature).toBe(0.3);
      expect(provider.lastOptions?.maxTokens).toBe(512);

      // 3. prompt 包含执行路径
      const messages = provider.lastMessages as Array<{ role: string; content: string }>;
      const promptText = messages[0]?.content ?? '';
      expect(promptText).toContain('分析 sales.csv');
      expect(promptText).toContain('读取 CSV 文件');
      expect(promptText).toContain('1000 行销售数据');

      // 4. 经验已入库
      expect(expRepo.insert).toHaveBeenCalledTimes(1);

      // 5. 返回的 experience 结构正确
      expect(experience).not.toBeNull();
      expect(experience!.keyLearnings).toHaveLength(3);
      expect(experience!.keyLearnings[0]).toContain('CSV');
      expect(experience!.tags).toContain('data-analysis');
      expect(experience!.tags).toContain('csv');

      // 6. 知识图谱建边被调用
      expect(kg.buildEdgesForExperience).toHaveBeenCalledTimes(1);
    });

    it('LLM 返回空 keyLearnings 和 tags 时不入库', async () => {
      const provider = new RecordingProvider('mock', '{"keyLearnings":[],"tags":[]}');
      const expRepo = createMockExperienceRepo();
      const kg = createMockKnowledgeGraph();
      const extractor = new ExperienceExtractor(provider, expRepo, kg, 'deepseek-chat');

      const result = await extractor.extract(makeSession(), makeTaskInfo());
      expect(result).toBeNull();
      expect(expRepo.insert).not.toHaveBeenCalled();
    });

    it('keyLearnings 超过 5 条时截断为 5 条', async () => {
      const mockResponse = JSON.stringify({
        keyLearnings: ['学习1', '学习2', '学习3', '学习4', '学习5', '学习6', '学习7'],
        tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'],
      });

      const provider = new RecordingProvider('mock', mockResponse);
      const expRepo = createMockExperienceRepo();
      const kg = createMockKnowledgeGraph();
      const extractor = new ExperienceExtractor(provider, expRepo, kg, 'deepseek-chat');

      const experience = await extractor.extract(makeSession(), makeTaskInfo());
      expect(experience).not.toBeNull();
      expect(experience!.keyLearnings).toHaveLength(5);
      expect(experience!.tags).toHaveLength(5);
    });
  });

  // --- SubagentCreator ---

  describe('SubagentCreator pipeline', () => {
    it('PatternMatch → LLM 生成 → Markdown 解析 → SubagentDefinition', async () => {
      const mockMarkdown = `---
name: "data-analyst"
description: "专门处理数据分析和报告生成的 Subagent"
mode: "autonomous"
model: "inherit"
tools: ["read", "write", "bash"]
triggers: ["数据分析", "CSV", "报告生成"]
---

# Subagent 指引

## 职责
处理各类数据分析任务，包括 CSV/Excel 读取、数据清洗、统计分析、图表生成和报告导出。

## 工作流程
1. 接收任务描述和文件路径
2. 读取并验证数据文件格式
3. 执行数据清洗和预处理
4. 进行统计分析（按需分组、聚合）
5. 生成图表和可视化
6. 导出分析报告

## 注意事项
- 读取文件前先检查格式和编码
- 大文件分块处理避免内存溢出
- 统计结果需标注数据来源和时间范围`;

      const provider = new RecordingProvider('mock', mockMarkdown);
      const git = createMockGitManager();
      const creator = new SubagentCreator(provider, git, 'deepseek-chat');

      const draft = await creator.createDraft(makePatternMatch());

      // 1. LLM 被调用
      expect(provider.callCount).toBe(1);
      expect(provider.lastModel).toBe('deepseek-chat');

      // 2. systemPrompt 正确
      expect(provider.lastOptions?.systemPrompt).toContain('Subagent 设计专家');
      expect(provider.lastOptions?.temperature).toBe(0.5);
      expect(provider.lastOptions?.maxTokens).toBe(1024);

      // 3. prompt 包含模式信息
      const messages = provider.lastMessages as Array<{ role: string; content: string }>;
      const promptText = messages[0]?.content ?? '';
      expect(promptText).toContain('data-analyst');
      expect(promptText).toContain('data-analysis+read_file+bash');
      expect(promptText).toContain('分析CSV数据');

      // 4. SubagentDefinition 结构正确
      expect(draft.meta.name).toBe('data-analyst');
      expect(draft.meta.description).toContain('数据分析');
      expect(draft.meta.mode).toBe('autonomous');
      expect(draft.meta.model).toBe('inherit');
      expect(draft.meta.tools).toEqual(['read', 'write', 'bash']);
      expect(draft.meta.triggers).toEqual(['数据分析', 'CSV', '报告生成']);

      // 5. 正文有结构
      expect(draft.content).toContain('# Subagent 指引');
      expect(draft.content).toContain('## 工作流程');
      expect(draft.content).toContain('## 注意事项');
    });

    it('LLM 返回无 frontmatter 时回退到模板', async () => {
      const provider = new RecordingProvider('mock', '这是一段没有 frontmatter 的纯文本');
      const git = createMockGitManager();
      const creator = new SubagentCreator(provider, git, 'deepseek-chat');

      const draft = await creator.createDraft(makePatternMatch());

      // 回退到模板：名称来自 patternMatch.suggestedName
      expect(draft.meta.name).toBe('data-analyst');
      expect(draft.meta.description).toBe('处理数据分析和报告生成的专家');
      expect(draft.meta.mode).toBe('autonomous');
      // 模板内容
      expect(draft.content).toContain('# Subagent 指引');
      expect(draft.content).toContain('## 职责');
    });

    it('LLM 返回空字符串时回退到模板', async () => {
      const provider = new RecordingProvider('mock', '');
      const git = createMockGitManager();
      const creator = new SubagentCreator(provider, git, 'deepseek-chat');

      const draft = await creator.createDraft(makePatternMatch());
      expect(draft.meta.name).toBe('data-analyst');
      expect(draft.content).toContain('# Subagent 指引');
    });
  });
});

// ============================================================
// Part 2: 真实 LLM 冒烟测试（条件运行）
// ============================================================

describe.skipIf(!HAS_REAL_LLM)('LLM 冒烟测试 — 真实 API 调用', () => {
  let realProvider: LLMProvider;
  let modelName: string;
  let workDir: string;

  beforeAll(() => {
    // 优先使用 DeepSeek（默认 evolution model）
    if (DEEPSEEK_KEY) {
      const { createProvider } = require('@crab-science/llm-layer');
      realProvider = createProvider('deepseek', DEEPSEEK_KEY);
      modelName = 'deepseek-chat';
    } else {
      const { createProvider } = require('@crab-science/llm-layer');
      realProvider = createProvider('openai', OPENAI_KEY);
      modelName = 'gpt-4o-mini';
    }
    workDir = os.tmpdir();
  });

  // --- SkillOptimizer 真实调用 ---

  describe('SkillOptimizer — 真实 LLM 优化建议', () => {
    it(
      'LLM 返回结构化 JSON 优化建议，字段完整且语义合理',
      async () => {
        const repo = createMockSkillMetricsRepo(makeExecutionRecords());
        const optimizer = new SkillOptimizer(realProvider, repo, modelName, workDir);

        const suggestion = await optimizer.generateSuggestion(
          'data-analysis',
          makeEvaluation(),
        );

        // 核心断言：必须返回有效建议
        expect(suggestion).not.toBeNull();
        expect(suggestion!.skillName).toBe('data-analysis');

        // severity 必须是 minor 或 major
        expect(['minor', 'major']).toContain(suggestion!.severity);

        // section 非空
        expect(suggestion!.section.length).toBeGreaterThan(0);

        // suggestion 文本有实质内容（>10字）
        expect(suggestion!.suggestion.length).toBeGreaterThan(10);

        // rationale 非空
        expect(suggestion!.rationale.length).toBeGreaterThan(5);

        // 语义合理性：建议应与失败模式相关（CSV 错误 / 成功率低）
        const fullText = `${suggestion!.section} ${suggestion!.suggestion} ${suggestion!.rationale}`;
        const hasRelevantKeyword =
          fullText.includes('CSV') ||
          fullText.includes('格式') ||
          fullText.includes('校验') ||
          fullText.includes('错误') ||
          fullText.includes('失败') ||
          fullText.includes('成功率') ||
          fullText.includes('检查');
        expect(hasRelevantKeyword).toBe(true);
      },
      REAL_LLM_TIMEOUT,
    );
  });

  // --- ExperienceExtractor 真实调用 ---

  describe('ExperienceExtractor — 真实 LLM 经验提取', () => {
    it(
      'LLM 从执行过程中提取有意义的 keyLearnings 和 tags',
      async () => {
        const expRepo = createMockExperienceRepo();
        const kg = createMockKnowledgeGraph();
        const extractor = new ExperienceExtractor(realProvider, expRepo, kg, modelName);

        const experience = await extractor.extract(makeSession(), makeTaskInfo());

        // 核心断言：必须提取到经验
        expect(experience).not.toBeNull();

        // keyLearnings 非空
        expect(experience!.keyLearnings.length).toBeGreaterThan(0);

        // 每条 learning 有实质内容
        for (const learning of experience!.keyLearnings) {
          expect(learning.length).toBeGreaterThan(5);
        }

        // tags 非空
        expect(experience!.tags.length).toBeGreaterThan(0);

        // 语义合理性：tags 应与任务相关
        const allTags = experience!.tags.join(' ').toLowerCase();
        const hasRelevantTag =
          allTags.includes('data') ||
          allTags.includes('分析') ||
          allTags.includes('csv') ||
          allTags.includes('报告') ||
          allTags.includes('统计') ||
          allTags.includes('sales') ||
          allTags.includes('python');
        expect(hasRelevantTag).toBe(true);

        // 经验已入库
        expect(expRepo.insert).toHaveBeenCalledTimes(1);

        // 知识图谱建边已调用
        expect(kg.buildEdgesForExperience).toHaveBeenCalledTimes(1);
      },
      REAL_LLM_TIMEOUT,
    );
  });

  // --- SubagentCreator 真实调用 ---

  describe('SubagentCreator — 真实 LLM Subagent 草案', () => {
    it(
      'LLM 生成完整的 Subagent 定义（frontmatter + 正文结构）',
      async () => {
        const git = createMockGitManager();
        const creator = new SubagentCreator(realProvider, git, modelName);

        const draft = await creator.createDraft(makePatternMatch());

        // 核心断言：meta 完整
        expect(draft.meta.name).toBeTruthy();
        expect(draft.meta.name.length).toBeGreaterThan(0);
        expect(draft.meta.description).toBeTruthy();
        expect(draft.meta.description.length).toBeGreaterThan(5);

        // mode 和 model 有效
        expect(['autonomous', 'interactive', 'supervised']).toContain(draft.meta.mode);
        expect(draft.meta.model).toBeTruthy();

        // tools 非空
        expect(draft.meta.tools.length).toBeGreaterThan(0);

        // 正文有结构化内容
        expect(draft.content.length).toBeGreaterThan(50);

        // 正文应包含工作流程或步骤
        const hasStructure =
          draft.content.includes('工作流程') ||
          draft.content.includes('步骤') ||
          draft.content.includes('流程') ||
          draft.content.includes('## ');
        expect(hasStructure).toBe(true);

        // 不是模板回退（模板内容较短且固定）
        const isTemplate =
          draft.content.includes('接收任务描述') &&
          draft.content.includes('执行任务') &&
          draft.content.includes('返回结果摘要');
        // 真实 LLM 应生成更丰富的内容（如果恰好返回模板内容，也算通过，但不期望）
        if (!isTemplate) {
          expect(draft.content.length).toBeGreaterThan(100);
        }
      },
      REAL_LLM_TIMEOUT,
    );
  });
});
