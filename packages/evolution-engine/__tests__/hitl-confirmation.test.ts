/**
 * Slice 3 HITL 确认循环测试
 *
 * 验证 EvolutionEngine 的 human-in-the-loop 确认机制：
 * - getPendingOptimizations: 获取待确认的 major 优化建议
 * - previewOptimization: 预览变更内容
 * - approveOptimization: 确认并应用
 * - rejectOptimization: 拒绝
 *
 * 测试策略：
 * 1. 空状态测试 — 初始状态无待确认建议，操作无效 ID 返回 null/false
 * 2. 完整流程测试 — mock provider 返回 major 建议 → runFullEvaluation → 验证 pending 队列
 */
import { describe, it, expect, vi } from 'vitest';
import { EvolutionEngine } from '../src/evolution-engine.js';
import type { LLMProvider, LLMOptions, StreamEvent, ModelInfo } from '@crab-science/llm-layer';
import type { OptimizationSuggestion } from '@crab-science/shared';

// ============================================================
// Mock 工厂
// ============================================================

/** 创建返回 major 建议的 mock provider */
function createMajorSuggestionProvider(): LLMProvider {
  const majorResponse = JSON.stringify({
    severity: 'major',
    section: '工作流程',
    suggestion: '重构核心步骤：将线性流程改为迭代式，增加错误恢复机制',
    rationale: '当前流程在高失败率场景下缺乏恢复能力，需要结构性调整',
  });

  return {
    name: 'mock',
    complete: async function* (
      _messages: unknown,
      _options: LLMOptions,
    ): AsyncGenerator<StreamEvent> {
      yield { type: 'text_delta' as const, content: majorResponse };
      yield {
        type: 'message_end' as const,
        usage: { inputTokens: 100, outputTokens: 50, cost: 0.001 },
      };
    },
    listModels: (): ModelInfo[] => [],
  };
}

/** 创建返回空响应的 mock provider */
function createEmptyProvider(): LLMProvider {
  return {
    name: 'mock',
    complete: async function* (): AsyncGenerator<StreamEvent> {
      yield { type: 'text_delta' as const, content: '' };
    },
    listModels: () => [],
  };
}

/** 创建 mock 数据库（返回带执行记录的 Skill） */
function createMockDatabaseWithSkills() {
  const mockStatement = {
    all: () => [{ skillName: 'test-skill' }],
    get: () => ({
      skillName: 'test-skill',
      currentVersion: 1,
      pendingValidation: 0,
      versionCreatedAt: null,
    }),
    run: () => {},
  };
  const mockExecStatement = {
    all: () => [],
    get: () => undefined,
    run: () => {},
  };
  return {
    getDatabase: () => ({
      prepare: (sql: string) => {
        if (sql.includes('DISTINCT skillName')) return mockStatement;
        if (sql.includes('skill_metric')) return mockStatement;
        return mockExecStatement;
      },
    }),
    close: () => {},
  };
}

/** 创建空 mock 数据库 */
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

/** 创建 mock GitManager */
function createMockGitManager() {
  return {
    commit: vi.fn().mockResolvedValue('mock-commit-hash'),
    log: vi.fn().mockResolvedValue([]),
    diff: vi.fn().mockResolvedValue('mock diff'),
    checkout: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn(),
    isWithinRepo: vi.fn().mockReturnValue(true),
    getRepoDir: vi.fn().mockReturnValue('/mock/repo'),
  };
}

/** 创建测试用 OptimizationSuggestion */
function makeSuggestion(
  overrides: Partial<OptimizationSuggestion> = {},
): OptimizationSuggestion {
  return {
    id: 'sug_test_001',
    skillName: 'test-skill',
    currentVersion: 1,
    severity: 'major',
    section: '工作流程',
    suggestion: '重构核心步骤为迭代式流程',
    rationale: '提高错误恢复能力',
    failurePatterns: ['成功率 50% 低于阈值 70%'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// 测试
// ============================================================

describe('Slice 3: HITL 确认循环', () => {
  describe('空状态测试', () => {
    it('初始状态 getPendingOptimizations 返回空数组', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: { autoApplyMinorChanges: false },
      });

      expect(engine.getPendingOptimizations()).toEqual([]);
    });

    it('previewOptimization 对不存在的 ID 返回 null', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      expect(engine.previewOptimization('nonexistent')).toBeNull();
    });

    it('approveOptimization 对不存在的 ID 返回 null', async () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const result = await engine.approveOptimization('nonexistent');
      expect(result).toBeNull();
    });

    it('rejectOptimization 对不存在的 ID 返回 false', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      expect(engine.rejectOptimization('nonexistent')).toBe(false);
    });
  });

  describe('HITL 方法行为验证', () => {
    it('previewOptimization 返回格式化预览文本', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      // 通过 applyOptimization 的反向上游，手动注入 pending suggestion
      // 这里用 (engine as any) 访问 private 字段来设置测试状态
      const suggestion = makeSuggestion();
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      const preview = engine.previewOptimization(suggestion.id);
      expect(preview).not.toBeNull();
      expect(preview).toContain('test-skill');
      expect(preview).toContain('v1 → v2');
      expect(preview).toContain('major');
      expect(preview).toContain('工作流程');
      expect(preview).toContain('重构核心步骤为迭代式流程');
      expect(preview).toContain('提高错误恢复能力');
      expect(preview).toContain('/approve');
      expect(preview).toContain('/reject');
    });

    it('getPendingOptimizations 返回待确认建议列表', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const sug1 = makeSuggestion({ id: 'sug_001' });
      const sug2 = makeSuggestion({ id: 'sug_002', skillName: 'other-skill' });
      (engine as any).pendingSuggestions.set(sug1.id, sug1);
      (engine as any).pendingSuggestions.set(sug2.id, sug2);

      const pending = engine.getPendingOptimizations();
      expect(pending).toHaveLength(2);
      expect(pending.map((s) => s.id)).toContain('sug_001');
      expect(pending.map((s) => s.id)).toContain('sug_002');
    });

    it('rejectOptimization 从队列中移除建议', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const suggestion = makeSuggestion();
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      expect(engine.getPendingOptimizations()).toHaveLength(1);

      const result = engine.rejectOptimization(suggestion.id);
      expect(result).toBe(true);
      expect(engine.getPendingOptimizations()).toHaveLength(0);
      expect(engine.previewOptimization(suggestion.id)).toBeNull();
    });

    it('rejectOptimization 对已移除的建议返回 false', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const suggestion = makeSuggestion();
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      // 第一次拒绝成功
      expect(engine.rejectOptimization(suggestion.id)).toBe(true);
      // 第二次拒绝失败（已不存在）
      expect(engine.rejectOptimization(suggestion.id)).toBe(false);
    });

    it('approveOptimization 从队列中移除建议并调用 applyOptimization', async () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const suggestion = makeSuggestion();
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      // Mock applyOptimization 以避免实际文件系统操作
      const mockApply = vi.fn().mockResolvedValue({ newVersion: 2, commitHash: 'abc123' });
      (engine as any).applyOptimization = mockApply;

      const result = await engine.approveOptimization(suggestion.id);

      expect(result).not.toBeNull();
      expect(result!.newVersion).toBe(2);
      expect(result!.commitHash).toBe('abc123');
      expect(mockApply).toHaveBeenCalledWith(suggestion);

      // 建议已从队列移除
      expect(engine.getPendingOptimizations()).toHaveLength(0);
    });

    it('approveOptimization 对不存在的建议返回 null 且不调用 applyOptimization', async () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const mockApply = vi.fn().mockResolvedValue({ newVersion: 2, commitHash: 'abc123' });
      (engine as any).applyOptimization = mockApply;

      const result = await engine.approveOptimization('nonexistent');

      expect(result).toBeNull();
      expect(mockApply).not.toHaveBeenCalled();
    });
  });

  describe('previewOptimization 格式验证', () => {
    it('预览包含版本号变更信息', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const suggestion = makeSuggestion({ currentVersion: 5 });
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      const preview = engine.previewOptimization(suggestion.id);
      expect(preview).toContain('v5 → v6');
    });

    it('预览包含建议 ID 用于 approve/reject', () => {
      const engine = new EvolutionEngine({
        database: createMockDatabase() as any,
        gitManager: createMockGitManager() as any,
        evolutionProvider: createEmptyProvider(),
        evolutionModel: 'test-model',
        config: {},
      });

      const suggestion = makeSuggestion({ id: 'sug_abc123' });
      (engine as any).pendingSuggestions.set(suggestion.id, suggestion);

      const preview = engine.previewOptimization(suggestion.id);
      expect(preview).toContain('sug_abc123');
    });
  });
});
