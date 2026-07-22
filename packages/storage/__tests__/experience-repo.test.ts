import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase } from '../src/database.js';
import { ExperienceRepository } from '../src/repositories/experience-repo.js';
import { isSqliteAvailable } from './helpers.js';
import type { Experience } from '@crab-science/shared';

describe.skipIf(!isSqliteAvailable())('ExperienceRepository', () => {
  let db: CrabDatabase;
  let repo: ExperienceRepository;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-exp-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new ExperienceRepository(db);
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

  /** 创建测试经验 */
  function makeExperience(
    overrides: Partial<Omit<Experience, 'id'>> = {},
  ): Omit<Experience, 'id'> {
    return {
      timestamp: new Date().toISOString(),
      taskId: 'task-1',
      sessionId: 'session-1',
      task: '完成数据分析任务',
      skillUsed: 'test-skill',
      subagentUsed: null,
      outcome: 'success',
      duration: 5000,
      keyLearnings: ['学会了使用 pivot table'],
      tags: ['data-analysis', 'python'],
      relatedExperiences: [],
      ...overrides,
    };
  }

  describe('insert', () => {
    it('应插入经验并返回 ID', () => {
      const saved = repo.insert(makeExperience());
      expect(saved.id).toMatch(/^exp_/);
    });
  });

  describe('findById', () => {
    it('应按 ID 查找经验', () => {
      const saved = repo.insert(makeExperience({ task: '特殊任务' }));
      const found = repo.findById(saved.id);
      expect(found).toBeDefined();
      expect(found!.task).toBe('特殊任务');
    });

    it('ID 不存在时返回 null', () => {
      const found = repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByTags', () => {
    it('应按标签查找经验', () => {
      repo.insert(makeExperience({ tags: ['python', 'ml'] }));
      repo.insert(makeExperience({ tags: ['python', 'nlp'] }));
      repo.insert(makeExperience({ tags: ['java'] }));

      const results = repo.findByTags(['python'], 10);
      expect(results).toHaveLength(2);
    });
  });

  describe('findBySkill', () => {
    it('应按 Skill 名称查找经验', () => {
      repo.insert(makeExperience({ skillUsed: 'skill-a' }));
      repo.insert(makeExperience({ skillUsed: 'skill-a' }));
      repo.insert(makeExperience({ skillUsed: 'skill-b' }));

      const results = repo.findBySkill('skill-a', 10);
      expect(results).toHaveLength(2);
    });
  });

  describe('findByTaskKeywords', () => {
    it('应按任务关键词查找经验', () => {
      repo.insert(makeExperience({ task: '数据分析报告' }));
      repo.insert(makeExperience({ task: '数据清洗' }));
      repo.insert(makeExperience({ task: '模型训练' }));

      const results = repo.findByTaskKeywords(['数据'], 10);
      expect(results).toHaveLength(2);
    });
  });

  describe('getRecent', () => {
    it('应按时间倒序返回最近经验', () => {
      repo.insert(makeExperience({ task: 'first' }));
      repo.insert(makeExperience({ task: 'second' }));
      repo.insert(makeExperience({ task: 'third' }));

      const results = repo.getRecent(2);
      expect(results).toHaveLength(2);
      expect(results[0].task).toBe('third');
    });
  });

  describe('getAll', () => {
    it('应返回所有经验', () => {
      repo.insert(makeExperience({ task: 'a' }));
      repo.insert(makeExperience({ task: 'b' }));

      const results = repo.getAll();
      expect(results).toHaveLength(2);
    });
  });
});
