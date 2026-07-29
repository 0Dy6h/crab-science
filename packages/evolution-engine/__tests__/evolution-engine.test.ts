import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvolutionEngine } from '../src/evolution-engine.js';
import type {
  EvolutionEvent,
  EvolutionEventCallback,
  Session,
  TaskInfo,
  Experience,
  PatternMatch,
} from '@crab-science/shared';
import type { LLMProvider } from '@crab-science/llm-layer';

/**
 * EvolutionEngine 纯逻辑测试（使用 mock 依赖）
 *
 * 重点测试：
 * - 事件系统：onEvent() 注册回调、emit() 触发回调
 * - fire-and-forget：onTaskComplete() 不阻塞、异常不传播
 * - taskCounter：递增逻辑
 * - taskInterval / ratingInterval：周期触发逻辑
 * - runFullEvaluation：并发保护（isEvaluating）
 * - changelog：记录和获取
 * - getSubagentDelegator / setSubagentDelegator：延迟注入
 */
describe('EvolutionEngine - mock-based tests', () => {
  // Mock 数据库：返回空结果
  function createMockDatabase() {
    const mockStatement = {
      all: () => [],
      get: () => undefined,
      run: () => {},
    };
    return {
      getDatabase: () => ({
        prepare: () => mockStatement,
      }),
      close: () => {},
    };
  }

  // Mock LLMProvider
  function createMockProvider(): LLMProvider {
    return {
      name: 'mock',
      complete: async function* () {
        yield {
          type: 'text_delta' as const,
          content: '{"keyLearnings":["test learning"],"tags":["test"]}',
        };
      },
      listModels: () => [],
    };
  }

  // Mock GitManager
  function createMockGitManager() {
    return {
      commit: vi.fn().mockResolvedValue('mock-commit-hash'),
      log: vi.fn().mockResolvedValue([]),
      checkout: vi.fn().mockResolvedValue(undefined),
      diff: vi.fn().mockResolvedValue(''),
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn(),
    };
  }

  // Mock Session（空节点，避免触发 LLM 调用）
  function createMockSession(): Session {
    return {
      id: 'test-session',
      nodes: {},
      rootId: '',
      currentNodeId: '',
      model: 'test-model',
      provider: 'test-provider',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      version: 2,
    };
  }

  // Mock TaskInfo
  function createMockTaskInfo(
    overrides: Partial<TaskInfo> = {},
  ): TaskInfo {
    return {
      task: '测试任务',
      skillUsed: null,
      subagentUsed: null,
      outcome: 'success',
      duration: 1000,
      toolsUsed: [],
      sessionId: 'test-session',
      ...overrides,
    };
  }

  function createEngine(config: Record<string, unknown> = {}) {
    return new EvolutionEngine({
      database: createMockDatabase() as any,
      gitManager: createMockGitManager() as any,
      evolutionProvider: createMockProvider(),
      evolutionModel: 'test-evolution-model',
      config: {
        taskInterval: 10,
        ratingInterval: 3,
        ...config,
      } as any,
    });
  }

  // ============================================================
  // 事件系统测试
  // ============================================================
  describe('事件系统', () => {
    it('onEvent 应注册事件回调', () => {
      const engine = createEngine();
      const callback: EvolutionEventCallback = vi.fn();
      engine.onEvent(callback);
      // 不会抛出异常即可
      expect(() => engine.onEvent(callback)).not.toThrow();
    });

    it('runFullEvaluation 应触发 evaluation_complete 事件', async () => {
      const engine = createEngine();
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.runFullEvaluation();

      const completeEvent = events.find(
        (e) => e.type === 'evaluation_complete',
      );
      expect(completeEvent).toBeDefined();
      if (completeEvent && completeEvent.type === 'evaluation_complete') {
        expect(completeEvent.summary).toContain('进化评估完成');
      }
    });

    it('无 Skill 数据时 evaluation_complete 应包含"无需优化"', async () => {
      const engine = createEngine();
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.runFullEvaluation();

      const completeEvent = events.find(
        (e) => e.type === 'evaluation_complete',
      );
      expect(completeEvent).toBeDefined();
      if (completeEvent && completeEvent.type === 'evaluation_complete') {
        expect(completeEvent.summary).toContain('无需优化');
      }
    });

    it('事件回调异常不应中断其他回调', async () => {
      const engine = createEngine();
      const events: EvolutionEvent[] = [];
      const errorCallback = vi.fn(() => {
        throw new Error('callback error');
      });
      const normalCallback = vi.fn((e: EvolutionEvent) => events.push(e));

      engine.onEvent(errorCallback);
      engine.onEvent(normalCallback);

      await engine.runFullEvaluation();

      // 即使第一个回调抛出异常，第二个回调仍应被调用
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // fire-and-forget 测试
  // ============================================================
  describe('fire-and-forget', () => {
    it('onTaskComplete 应立即返回不阻塞', async () => {
      const engine = createEngine();
      const session = createMockSession();
      const taskInfo = createMockTaskInfo();

      // onTaskComplete 应立即返回（不抛出异常）
      await expect(
        engine.onTaskComplete(session, taskInfo),
      ).resolves.toBeUndefined();
    });

    it('onTaskComplete 异常应被捕获不传播', async () => {
      const engine = createEngine({ taskInterval: 1 }); // 每次都触发评估
      const session = createMockSession();
      // 传入可能导致异常的 taskInfo
      const taskInfo = createMockTaskInfo({
        skillUsed: 'test-skill',
      });

      // 不应抛出异常
      await expect(
        engine.onTaskComplete(session, taskInfo),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // taskCounter 测试
  // ============================================================
  describe('taskCounter', () => {
    it('初始值应为 0', () => {
      const engine = createEngine();
      expect(engine.getTaskCounter()).toBe(0);
    });

    it('onTaskComplete 后应递增', async () => {
      const engine = createEngine();
      const session = createMockSession();
      const taskInfo = createMockTaskInfo();

      engine.onTaskComplete(session, taskInfo);

      // 等待 fire-and-forget 完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(engine.getTaskCounter()).toBe(1);
    });
  });

  // ============================================================
  // ratingInterval 测试
  // ============================================================
  describe('ratingInterval', () => {
    it('达到 ratingInterval 时应触发 rating_request 事件', async () => {
      const engine = createEngine({ ratingInterval: 1 });
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      const session = createMockSession();
      const taskInfo = createMockTaskInfo({ task: '测试评分任务' });

      engine.onTaskComplete(session, taskInfo);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const ratingEvent = events.find((e) => e.type === 'rating_request');
      expect(ratingEvent).toBeDefined();
      if (ratingEvent && ratingEvent.type === 'rating_request') {
        expect(ratingEvent.taskDescription).toBe('测试评分任务');
      }
    });

    it('未达到 ratingInterval 时不应触发 rating_request', async () => {
      const engine = createEngine({ ratingInterval: 5 });
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      const session = createMockSession();
      const taskInfo = createMockTaskInfo();

      engine.onTaskComplete(session, taskInfo);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const ratingEvent = events.find((e) => e.type === 'rating_request');
      expect(ratingEvent).toBeUndefined();
    });
  });

  // ============================================================
  // taskInterval 测试
  // ============================================================
  describe('taskInterval', () => {
    it('达到 taskInterval 时应触发 runFullEvaluation', async () => {
      const engine = createEngine({ taskInterval: 1 });
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      const session = createMockSession();
      const taskInfo = createMockTaskInfo();

      engine.onTaskComplete(session, taskInfo);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const completeEvent = events.find(
        (e) => e.type === 'evaluation_complete',
      );
      expect(completeEvent).toBeDefined();
    });
  });

  // ============================================================
  // runFullEvaluation 并发保护测试
  // ============================================================
  describe('runFullEvaluation 并发保护', () => {
    it('并发调用 runFullEvaluation 不应同时执行', async () => {
      const engine = createEngine();
      const events: EvolutionEvent[] = [];
      engine.onEvent((e) => events.push(e));

      // 同时调用两次
      await Promise.all([
        engine.runFullEvaluation(),
        engine.runFullEvaluation(),
      ]);

      // 应只有一次 evaluation_complete 事件（第二次被跳过）
      const completeEvents = events.filter(
        (e) => e.type === 'evaluation_complete',
      );
      expect(completeEvents.length).toBe(1);
    });
  });

  // ============================================================
  // changelog 测试
  // ============================================================
  describe('changelog', () => {
    it('初始 changelog 应为空', () => {
      const engine = createEngine();
      expect(engine.getChangelog()).toHaveLength(0);
    });

    it('getChangelog 应返回副本（不暴露内部数组）', () => {
      const engine = createEngine();
      const changelog1 = engine.getChangelog();
      const changelog2 = engine.getChangelog();
      expect(changelog1).not.toBe(changelog2); // 不同引用
      expect(changelog1).toEqual(changelog2); // 相同内容
    });
  });

  // ============================================================
  // SubagentDelegator 延迟注入测试
  // ============================================================
  describe('SubagentDelegator 延迟注入', () => {
    it('初始 delegator 应为 null', () => {
      const engine = createEngine();
      expect(engine.getSubagentDelegator()).toBeNull();
    });

    it('setSubagentDelegator 应设置 delegator', () => {
      const engine = createEngine();
      const mockDelegator = { delegate: vi.fn() };
      engine.setSubagentDelegator(mockDelegator as any);
      expect(engine.getSubagentDelegator()).toBe(mockDelegator);
    });
  });

  // ============================================================
  // 查询接口测试
  // ============================================================
  describe('查询接口', () => {
    it('getAllEvaluations 无数据时应返回空数组', () => {
      const engine = createEngine();
      expect(engine.getAllEvaluations()).toHaveLength(0);
    });

    it('getDetectedPatterns 无数据时应返回空数组', () => {
      const engine = createEngine();
      expect(engine.getDetectedPatterns()).toHaveLength(0);
    });

    it('getRecentExperiences 无数据时应返回空数组', () => {
      const engine = createEngine();
      expect(engine.getRecentExperiences()).toHaveLength(0);
    });

    it('retrieveExperienceForInjection 无数据时应返回空字符串', () => {
      const engine = createEngine();
      const result = engine.retrieveExperienceForInjection('测试任务');
      expect(result).toBe('');
    });

    it('getSubagentMetrics 无数据时应返回零值指标', () => {
      const engine = createEngine();
      const metrics = engine.getSubagentMetrics('nonexistent');
      expect(metrics.delegationCount).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });
});
