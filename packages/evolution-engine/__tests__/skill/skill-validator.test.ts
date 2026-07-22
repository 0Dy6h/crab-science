import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CrabDatabase, GitManager, SkillMetricsRepository } from '@crab-science/storage';
import { SkillValidator } from '../../src/skill/skill-validator.js';
import { SkillVersioner } from '../../src/skill/skill-versioner.js';
import type { SkillExecutionRecord } from '@crab-science/shared';

let sqliteAvailable = false;
try {
  const Database = require('better-sqlite3');
  const testDb = new Database(':memory:');
  testDb.close();
  sqliteAvailable = true;
} catch { sqliteAvailable = false; }

describe.skipIf(!sqliteAvailable)('SkillValidator', () => {
  let db: CrabDatabase;
  let repo: SkillMetricsRepository;
  let gitManager: GitManager;
  let versioner: SkillVersioner;
  let validator: SkillValidator;
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-val-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    db = new CrabDatabase();
    db.initialize();
    repo = new SkillMetricsRepository(db);
    gitManager = new GitManager(testDir);
    versioner = new SkillVersioner(gitManager);
    validator = new SkillValidator(repo, versioner, {
      skillRollbackSuccessRateDrop: 0.15,
      skillRollbackSatisfactionDrop: 0.5,
      skillValidationWindowSize: 3,
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

  function insertRecord(
    overrides: Partial<Omit<SkillExecutionRecord, 'id' | 'timestamp'>> = {},
  ): void {
    repo.insertExecution({
      skillName: 'test-skill',
      task: 'test',
      steps: [],
      durationMs: 1000,
      status: 'success',
      tokenUsage: undefined,
      adopted: true,
      rating: 0,
      skillVersion: 1,
      sessionId: 's1',
      ...overrides,
    });
  }

  async function createVersionedSkill(skillName: string): Promise<void> {
    const skillDir = path.join(testDir, '.crab-science', 'skills', skillName);
    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.mkdirSync(skillDir, { recursive: true });

    fs.writeFileSync(
      skillPath,
      `---\nname: ${skillName}\nversion: 1\n---\n# ${skillName}\n\nv1 content\n`,
      'utf-8',
    );
    await gitManager.commit(skillPath, `feat(skill): ${skillName} v1`);

    fs.writeFileSync(
      skillPath,
      `---\nname: ${skillName}\nversion: 2\n---\n# ${skillName}\n\nv2 content\n`,
      'utf-8',
    );
    await gitManager.commit(skillPath, `feat(skill): ${skillName} v2`);
  }

  describe('markPendingValidation', () => {
    it('应标记 Skill 为待验证状态', () => {
      repo.getOrCreateSkillMetricRecord('test-skill');
      validator.markPendingValidation('test-skill', 2);

      const status = validator.checkValidationStatus('test-skill');
      expect(status.pending).toBe(true);
      expect(status.windowSize).toBe(3);
    });
  });

  describe('checkValidationStatus', () => {
    it('未标记时返回 pending=false', () => {
      const status = validator.checkValidationStatus('nonexistent');
      expect(status.pending).toBe(false);
    });

    it('应正确报告执行次数', () => {
      repo.getOrCreateSkillMetricRecord('test-skill');
      validator.markPendingValidation('test-skill', 2);

      insertRecord({ skillVersion: 2 });
      insertRecord({ skillVersion: 2 });

      const status = validator.checkValidationStatus('test-skill');
      expect(status.executionsSinceVersion).toBe(2);
    });
  });

  describe('validate', () => {
    it('执行次数不足窗口大小时不应触发回滚', async () => {
      repo.getOrCreateSkillMetricRecord('test-skill');
      validator.markPendingValidation('test-skill', 2);

      // 仅 1 条新版本记录（窗口大小 3）
      insertRecord({ skillVersion: 2, status: 'failed' });

      const result = await validator.validate('test-skill');
      expect(result.rolledBack).toBe(false);
    });

    it('新版本成功率显著下降时应触发回滚', async () => {
      await createVersionedSkill('test-skill');

      // 旧版本：高成功率
      insertRecord({ skillVersion: 1, status: 'success' });
      insertRecord({ skillVersion: 1, status: 'success' });
      insertRecord({ skillVersion: 1, status: 'success' });

      repo.getOrCreateSkillMetricRecord('test-skill');
      validator.markPendingValidation('test-skill', 2);

      // 新版本：低成功率（成功率下降 > 15%）
      insertRecord({ skillVersion: 2, status: 'failed' });
      insertRecord({ skillVersion: 2, status: 'failed' });
      insertRecord({ skillVersion: 2, status: 'failed' });

      const result = await validator.validate('test-skill');
      expect(result.rolledBack).toBe(true);
      expect(result.reason).toContain('成功率下降');
    });

    it('新版本成功率正常时不应回滚', async () => {
      insertRecord({ skillVersion: 1, status: 'success' });
      insertRecord({ skillVersion: 1, status: 'success' });

      repo.getOrCreateSkillMetricRecord('test-skill');
      validator.markPendingValidation('test-skill', 2);

      insertRecord({ skillVersion: 2, status: 'success' });
      insertRecord({ skillVersion: 2, status: 'success' });
      insertRecord({ skillVersion: 2, status: 'success' });

      const result = await validator.validate('test-skill');
      expect(result.rolledBack).toBe(false);
    });
  });
});
