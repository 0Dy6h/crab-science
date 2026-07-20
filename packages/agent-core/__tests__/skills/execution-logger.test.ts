import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillExecutionLogger } from '../../src/skills/execution-logger.js';
import type { SkillExecutionRecord } from '@crab-science/shared';

describe('SkillExecutionLogger', () => {
  let skillsDir: string;
  let logger: SkillExecutionLogger;

  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-exec-'));
    logger = new SkillExecutionLogger([skillsDir]);
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  /** 创建 skill 目录 */
  function createSkillDir(skillName: string): string {
    const dir = path.join(skillsDir, skillName);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 创建测试执行记录 */
  function makeRecord(
    overrides: Partial<Omit<SkillExecutionRecord, 'id' | 'timestamp'>> = {},
  ): Omit<SkillExecutionRecord, 'id' | 'timestamp'> {
    return {
      skillName: 'test-skill',
      task: 'test task',
      steps: ['step1', 'step2'],
      durationMs: 1000,
      status: 'success',
      ...overrides,
    };
  }

  // ============================================================
  // getLogPath
  // ============================================================

  describe('getLogPath', () => {
    it('应返回已存在 skill 目录下的 executions.jsonl 路径', () => {
      createSkillDir('my-skill');

      const logPath = logger.getLogPath('my-skill');

      expect(logPath).toContain('my-skill');
      expect(logPath).toContain('executions.jsonl');
    });

    it('skill 不存在时应返回默认目录下的路径', () => {
      const logPath = logger.getLogPath('nonexistent-skill');

      // 应回退到第一个搜索目录
      expect(logPath).toContain('nonexistent-skill');
      expect(logPath).toContain('executions.jsonl');
      expect(logPath.startsWith(skillsDir)).toBe(true);
    });

    it('多个搜索目录时应优先使用已存在的 skill 目录', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-exec2-'));
      try {
        // 在 dir2 中创建 skill
        fs.mkdirSync(path.join(dir2, 'skill-in-dir2'), { recursive: true });

        const multiLogger = new SkillExecutionLogger([skillsDir, dir2]);
        const logPath = multiLogger.getLogPath('skill-in-dir2');

        expect(logPath.startsWith(dir2)).toBe(true);
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });
  });

  // ============================================================
  // log
  // ============================================================

  describe('log', () => {
    it('应追加写入 JSONL 格式的执行记录', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord());

      const logPath = logger.getLogPath('test-skill');
      expect(fs.existsSync(logPath)).toBe(true);

      const raw = fs.readFileSync(logPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(1);

      const record = JSON.parse(lines[0]);
      expect(record.skillName).toBe('test-skill');
      expect(record.task).toBe('test task');
      expect(record.status).toBe('success');
    });

    it('应自动生成 id 和 timestamp', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord());

      const logPath = logger.getLogPath('test-skill');
      const raw = fs.readFileSync(logPath, 'utf-8');
      const record = JSON.parse(raw.trim());

      expect(record.id).toBeTruthy();
      expect(record.id.startsWith('exec_')).toBe(true);
      expect(record.timestamp).toBeTruthy();
      // ISO 8601 格式
      expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
    });

    it('skill 目录不存在时应自动创建', () => {
      // 不预创建 skill 目录
      logger.log('auto-create-skill', makeRecord({ skillName: 'auto-create-skill' }));

      const logPath = logger.getLogPath('auto-create-skill');
      expect(fs.existsSync(logPath)).toBe(true);
    });

    it('多次 log 应追加到同一文件', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 'task1' }));
      logger.log('test-skill', makeRecord({ task: 'task2' }));
      logger.log('test-skill', makeRecord({ task: 'task3' }));

      const logPath = logger.getLogPath('test-skill');
      const raw = fs.readFileSync(logPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(3);
      const tasks = lines.map((l) => JSON.parse(l).task);
      expect(tasks).toContain('task1');
      expect(tasks).toContain('task2');
      expect(tasks).toContain('task3');
    });

    it('应保存完整的执行记录字段', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({
        status: 'failed',
        error: 'something went wrong',
        tokenUsage: { inputTokens: 500, outputTokens: 200 },
        steps: ['step1', 'step2', 'step3'],
        durationMs: 5000,
      }));

      const logPath = logger.getLogPath('test-skill');
      const raw = fs.readFileSync(logPath, 'utf-8');
      const record = JSON.parse(raw.trim());

      expect(record.status).toBe('failed');
      expect(record.error).toBe('something went wrong');
      expect(record.tokenUsage.inputTokens).toBe(500);
      expect(record.tokenUsage.outputTokens).toBe(200);
      expect(record.steps).toEqual(['step1', 'step2', 'step3']);
      expect(record.durationMs).toBe(5000);
    });
  });

  // ============================================================
  // query
  // ============================================================

  describe('query', () => {
    it('应返回所有执行记录', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 'task1' }));
      logger.log('test-skill', makeRecord({ task: 'task2' }));

      const records = logger.query('test-skill');

      expect(records.length).toBe(2);
    });

    it('应按时间倒序排列', async () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 'first' }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      logger.log('test-skill', makeRecord({ task: 'second' }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      logger.log('test-skill', makeRecord({ task: 'third' }));

      const records = logger.query('test-skill');

      expect(records.length).toBe(3);
      // 倒序：最新的在前
      expect(records[0].task).toBe('third');
      expect(records[1].task).toBe('second');
      expect(records[2].task).toBe('first');
    });

    it('日志文件不存在时应返回空数组', () => {
      createSkillDir('empty-skill');

      const records = logger.query('empty-skill');

      expect(records).toEqual([]);
    });

    it('应支持按状态筛选', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ status: 'success', task: 'ok1' }));
      logger.log('test-skill', makeRecord({ status: 'failed', task: 'err1' }));
      logger.log('test-skill', makeRecord({ status: 'success', task: 'ok2' }));

      const successRecords = logger.query('test-skill', { status: 'success' });
      expect(successRecords.length).toBe(2);
      expect(successRecords.every((r) => r.status === 'success')).toBe(true);

      const failedRecords = logger.query('test-skill', { status: 'failed' });
      expect(failedRecords.length).toBe(1);
      expect(failedRecords[0].task).toBe('err1');
    });

    it('应支持 limit 限制返回数量', () => {
      createSkillDir('test-skill');

      for (let i = 0; i < 5; i++) {
        logger.log('test-skill', makeRecord({ task: `task${i}` }));
      }

      const records = logger.query('test-skill', { limit: 3 });
      expect(records.length).toBe(3);
    });

    it('应跳过损坏的 JSONL 行', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 'valid' }));

      // 手动追加损坏的行
      const logPath = logger.getLogPath('test-skill');
      fs.appendFileSync(logPath, '{ invalid json }\n');

      const records = logger.query('test-skill');
      expect(records.length).toBe(1);
      expect(records[0].task).toBe('valid');
    });

    it('应同时支持 status 筛选和 limit', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ status: 'success', task: 'ok1' }));
      logger.log('test-skill', makeRecord({ status: 'failed', task: 'err1' }));
      logger.log('test-skill', makeRecord({ status: 'success', task: 'ok2' }));
      logger.log('test-skill', makeRecord({ status: 'success', task: 'ok3' }));

      const records = logger.query('test-skill', { status: 'success', limit: 2 });
      expect(records.length).toBe(2);
      expect(records.every((r) => r.status === 'success')).toBe(true);
    });

    it('limit 为 0 或负数时应返回全部记录', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 't1' }));
      logger.log('test-skill', makeRecord({ task: 't2' }));

      const records = logger.query('test-skill', { limit: 0 });
      expect(records.length).toBe(2);
    });
  });

  // ============================================================
  // count
  // ============================================================

  describe('count', () => {
    it('应返回执行记录总数', () => {
      createSkillDir('test-skill');

      logger.log('test-skill', makeRecord({ task: 't1' }));
      logger.log('test-skill', makeRecord({ task: 't2' }));
      logger.log('test-skill', makeRecord({ task: 't3' }));

      expect(logger.count('test-skill')).toBe(3);
    });

    it('无记录时应返回 0', () => {
      createSkillDir('empty-skill');
      expect(logger.count('empty-skill')).toBe(0);
    });

    it('skill 不存在时应返回 0', () => {
      expect(logger.count('nonexistent')).toBe(0);
    });
  });
});
