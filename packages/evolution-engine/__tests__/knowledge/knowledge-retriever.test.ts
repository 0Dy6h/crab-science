import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase, ExperienceRepository, KnowledgeRepository } from '@crab-science/storage';
import { KnowledgeRetriever } from '../../src/knowledge/knowledge-retriever.js';
import type { Experience } from '@crab-science/shared';

let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('KnowledgeRetriever - integration', () => {
  let db: CrabDatabase;
  let expRepo: ExperienceRepository;
  let knowledgeRepo: KnowledgeRepository;
  let retriever: KnowledgeRetriever;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-kr-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    expRepo = new ExperienceRepository(db);
    knowledgeRepo = new KnowledgeRepository(db);
      retriever = new KnowledgeRetriever(expRepo, knowledgeRepo, {
      experienceInjectionTokenBudget: 500,
    });
  });

  afterEach(() => {
    db.close();
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function insertExperience(
    overrides: Partial<Omit<Experience, 'id'>> = {},
  ): string {
    return expRepo.insert({
      timestamp: new Date().toISOString(),
      taskId: 'task-1',
      sessionId: 's1',
      task: '数据分析任务',
      skillUsed: 'test-skill',
      subagentUsed: null,
      outcome: 'success',
      duration: 5000,
      keyLearnings: ['学会了数据处理'],
      tags: ['data', 'python'],
      relatedExperiences: [],
      ...overrides,
    });
  }

  describe('retrieve', () => {
    it('应按关键词检索相关经验', () => {
      insertExperience({ task: '数据分析报告生成' });
      insertExperience({ task: '模型训练与评估' });
      insertExperience({ task: '数据清洗流程' });

      const results = retriever.retrieve('数据分析');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((e) => e.task.includes('数据'))).toBe(true);
    });

    it('无匹配时返回空数组', () => {
      insertExperience({ task: '数据分析' });

      const results = retriever.retrieve('完全不相关的关键词xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('formatForInjection', () => {
    it('应将经验格式化为注入文本', () => {
      insertExperience({
        task: '数据分析',
        keyLearnings: ['使用 pandas 处理数据'],
        outcome: 'success',
      });

      const experiences = retriever.retrieve('数据分析');
      const text = retriever.formatForInjection(experiences);

      expect(text).toContain('数据分析');
      expect(text).toContain('pandas');
    });

    it('空经验列表应返回空字符串', () => {
      const text = retriever.formatForInjection([]);
      expect(text).toBe('');
    });
  });
});
