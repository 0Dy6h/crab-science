import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase, ExperienceRepository, KnowledgeRepository } from '@crab-science/storage';
import { KnowledgeGraph } from '../../src/knowledge/knowledge-graph.js';
import type { Experience } from '@crab-science/shared';

let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('KnowledgeGraph', () => {
  let db: CrabDatabase;
  let expRepo: ExperienceRepository;
  let knowledgeRepo: KnowledgeRepository;
  let graph: KnowledgeGraph;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-kg-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    expRepo = new ExperienceRepository(db);
    knowledgeRepo = new KnowledgeRepository(db);
    graph = new KnowledgeGraph(knowledgeRepo, expRepo);
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
  ): Experience {
    return expRepo.insert({
      timestamp: new Date().toISOString(),
      taskId: 'task-1',
      sessionId: 's1',
      task: 'test task',
      skillUsed: 'test-skill',
      subagentUsed: null,
      outcome: 'success',
      duration: 5000,
      keyLearnings: ['learning 1'],
      tags: ['python', 'data'],
      relatedExperiences: [],
      ...overrides,
    });
  }

  describe('buildEdgesForExperience', () => {
    it('应为新经验创建 same_tag 边', () => {
      const exp1 = insertExperience({ tags: ['python', 'ml'] });
      const exp2 = insertExperience({ tags: ['python', 'nlp'] });

      graph.buildEdgesForExperience(exp2);

      const edges = knowledgeRepo.getAllEdges();
      const tagEdges = edges.filter((e) => e.type === 'same_tag');
      expect(tagEdges.length).toBeGreaterThan(0);

      // 应有 exp2 → exp1 的边（共享 python 标签）
      const hasEdge = tagEdges.some(
        (e) =>
          (e.sourceId === exp2.id && e.targetId === exp1.id) ||
          (e.sourceId === exp1.id && e.targetId === exp2.id),
      );
      expect(hasEdge).toBe(true);
    });

    it('应创建 same_skill 边', () => {
      insertExperience({ skillUsed: 'shared-skill' });
      const exp2 = insertExperience({ skillUsed: 'shared-skill' });

      graph.buildEdgesForExperience(exp2);

      const edges = knowledgeRepo.getAllEdges();
      const skillEdges = edges.filter((e) => e.type === 'same_skill');
      expect(skillEdges.length).toBeGreaterThan(0);
    });

    it('无相似经验时不应创建边', () => {
      insertExperience({ tags: ['unique-tag'], skillUsed: 'unique-skill' });
      const exp2 = insertExperience({ tags: ['different-tag'], skillUsed: 'different-skill' });

      graph.buildEdgesForExperience(exp2);

      const edges = knowledgeRepo.findEdges(exp2.id);
      expect(edges).toHaveLength(0);
    });
  });
});
