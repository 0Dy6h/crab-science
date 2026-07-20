import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLoader } from '../../src/skills/loader.js';

describe('SkillLoader Phase 2 Enhanced', () => {
  let skillsDir: string;
  let loader: SkillLoader;

  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-skill-enh-'));
    loader = new SkillLoader([skillsDir]);
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  /**
   * 创建完整的测试 skill 目录结构
   * 包含 SKILL.md + 附加 .md 文件 + .py 脚本 + .sh 脚本
   */
  function createFullSkill(skillName: string): string {
    const skillDir = path.join(skillsDir, skillName);
    fs.mkdirSync(skillDir, { recursive: true });

    // SKILL.md
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: Test skill\nversion: 2\nlastUpdated: 2024-01-01T00:00:00.000Z\n---\n\n# ${skillName}\n\nMain content.`,
    );

    // 附加 .md 文件
    fs.writeFileSync(
      path.join(skillDir, 'search-strategy.md'),
      '# Search Strategy\n\nDetailed search approach.',
    );
    fs.writeFileSync(
      path.join(skillDir, 'data-format.md'),
      '# Data Format\n\nFormat specification.',
    );

    // Python 脚本
    fs.writeFileSync(
      path.join(skillDir, 'search.py'),
      '#!/usr/bin/env python3\nprint("search")\n',
    );

    // Shell 脚本
    fs.writeFileSync(
      path.join(skillDir, 'cleanup.sh'),
      '#!/bin/bash\necho "cleanup"\n',
    );

    // 非附加文件（不应被列出）
    fs.writeFileSync(
      path.join(skillDir, 'config.json'),
      '{"key": "value"}',
    );

    return skillDir;
  }

  // ============================================================
  // loadAttachment (Level 2)
  // ============================================================

  describe('loadAttachment', () => {
    it('应加载存在的附加文件', () => {
      createFullSkill('test-skill');

      const content = loader.loadAttachment('test-skill', 'search-strategy.md');

      expect(content).not.toBeNull();
      expect(content).toContain('Search Strategy');
    });

    it('加载不存在的附加文件应返回 null', () => {
      createFullSkill('test-skill');

      const result = loader.loadAttachment('test-skill', 'nonexistent.md');

      expect(result).toBeNull();
    });

    it('加载不存在的 skill 应返回 null', () => {
      const result = loader.loadAttachment('nonexistent-skill', 'file.md');

      expect(result).toBeNull();
    });

    it('应能加载 SKILL.md 本身', () => {
      createFullSkill('test-skill');

      const content = loader.loadAttachment('test-skill', 'SKILL.md');

      expect(content).not.toBeNull();
      expect(content).toContain('test-skill');
    });

    it('应能加载非 .md 附加文件', () => {
      createFullSkill('test-skill');

      const content = loader.loadAttachment('test-skill', 'config.json');

      expect(content).not.toBeNull();
      expect(content).toContain('"key"');
    });
  });

  // ============================================================
  // getScriptPath (Level 3)
  // ============================================================

  describe('getScriptPath', () => {
    it('应返回存在的脚本路径', () => {
      createFullSkill('test-skill');

      const scriptPath = loader.getScriptPath('test-skill', 'search.py');

      expect(scriptPath).not.toBeNull();
      expect(scriptPath).toContain('search.py');
      expect(fs.existsSync(scriptPath!)).toBe(true);
    });

    it('应返回 shell 脚本路径', () => {
      createFullSkill('test-skill');

      const scriptPath = loader.getScriptPath('test-skill', 'cleanup.sh');

      expect(scriptPath).not.toBeNull();
      expect(scriptPath).toContain('cleanup.sh');
    });

    it('不存在的脚本应返回 null', () => {
      createFullSkill('test-skill');

      const result = loader.getScriptPath('test-skill', 'nonexistent.py');

      expect(result).toBeNull();
    });

    it('不存在的 skill 应返回 null', () => {
      const result = loader.getScriptPath('nonexistent-skill', 'script.py');

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // listAttachments
  // ============================================================

  describe('listAttachments', () => {
    it('应列出所有 .md 附加文件（排除 SKILL.md）', () => {
      createFullSkill('test-skill');

      const attachments = loader.listAttachments('test-skill');

      expect(attachments.length).toBe(2);
      const names = attachments.map((a) => a.name);
      expect(names).toContain('search-strategy.md');
      expect(names).toContain('data-format.md');
      expect(names).not.toContain('SKILL.md');
    });

    it('应返回正确的文件路径和大小', () => {
      createFullSkill('test-skill');

      const attachments = loader.listAttachments('test-skill');
      const searchStrategy = attachments.find((a) => a.name === 'search-strategy.md');

      expect(searchStrategy).toBeDefined();
      expect(searchStrategy!.path).toContain('search-strategy.md');
      expect(searchStrategy!.size).toBeGreaterThan(0);
    });

    it('无附加文件的 skill 应返回空数组', () => {
      const skillDir = path.join(skillsDir, 'minimal-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: minimal\ndescription: minimal\n---\n\nBody',
      );

      const attachments = loader.listAttachments('minimal-skill');

      expect(attachments).toEqual([]);
    });

    it('不存在的 skill 应返回空数组', () => {
      const attachments = loader.listAttachments('nonexistent');

      expect(attachments).toEqual([]);
    });

    it('应只列出 .md 文件，不列出 .py/.sh/.json', () => {
      createFullSkill('test-skill');

      const attachments = loader.listAttachments('test-skill');

      // 只应有 2 个 .md 文件
      expect(attachments.length).toBe(2);
      for (const att of attachments) {
        expect(att.name.endsWith('.md')).toBe(true);
      }
    });
  });

  // ============================================================
  // listScripts
  // ============================================================

  describe('listScripts', () => {
    it('应列出 .py 和 .sh 脚本', () => {
      createFullSkill('test-skill');

      const scripts = loader.listScripts('test-skill');

      expect(scripts.length).toBe(2);
      const names = scripts.map((s) => s.name);
      expect(names).toContain('search');
      expect(names).toContain('cleanup');
    });

    it('应正确设置脚本语言', () => {
      createFullSkill('test-skill');

      const scripts = loader.listScripts('test-skill');
      const pyScript = scripts.find((s) => s.name === 'search');
      const shScript = scripts.find((s) => s.name === 'cleanup');

      expect(pyScript!.language).toBe('python');
      expect(shScript!.language).toBe('shell');
    });

    it('应返回正确的脚本路径', () => {
      createFullSkill('test-skill');

      const scripts = loader.listScripts('test-skill');

      for (const script of scripts) {
        expect(fs.existsSync(script.path)).toBe(true);
      }
    });

    it('脚本名应去除扩展名', () => {
      createFullSkill('test-skill');

      const scripts = loader.listScripts('test-skill');

      for (const script of scripts) {
        expect(script.name).not.toMatch(/\.(py|sh)$/);
      }
    });

    it('无脚本的 skill 应返回空数组', () => {
      const skillDir = path.join(skillsDir, 'no-scripts');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: no-scripts\ndescription: no scripts\n---\n\nBody',
      );

      const scripts = loader.listScripts('no-scripts');

      expect(scripts).toEqual([]);
    });

    it('不存在的 skill 应返回空数组', () => {
      const scripts = loader.listScripts('nonexistent');

      expect(scripts).toEqual([]);
    });
  });

  // ============================================================
  // getEnhancedMeta
  // ============================================================

  describe('getEnhancedMeta', () => {
    it('应返回含附加文件和脚本的增强元数据', () => {
      createFullSkill('test-skill');

      const meta = loader.getEnhancedMeta('test-skill');

      expect(meta).not.toBeNull();
      expect(meta!.name).toBe('test-skill');
      expect(meta!.description).toBe('Test skill');
      expect(meta!.version).toBe(2);
      // gray-matter parses unquoted YAML dates as Date objects
      expect(meta!.lastUpdated).toBeTruthy();
      expect(new Date(meta!.lastUpdated as unknown as string).toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(meta!.attachments.length).toBe(2);
      expect(meta!.scripts.length).toBe(2);
    });

    it('应包含 executionCount（初始为 0）', () => {
      createFullSkill('test-skill');

      const meta = loader.getEnhancedMeta('test-skill');

      expect(meta!.executionCount).toBe(0);
    });

    it('recordExecution 后 executionCount 应增加', () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'test task',
        steps: ['step1'],
        durationMs: 100,
        status: 'success',
      });

      // 清除缓存以获取最新数据
      loader.clearCache();
      const meta = loader.getEnhancedMeta('test-skill');

      expect(meta!.executionCount).toBe(1);
    });

    it('不存在的 skill 应返回 null', () => {
      const meta = loader.getEnhancedMeta('nonexistent');

      expect(meta).toBeNull();
    });
  });

  // ============================================================
  // recordExecution + getExecutionHistory
  // ============================================================

  describe('recordExecution + getExecutionHistory', () => {
    it('应记录执行并查询历史', () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'literature search',
        steps: ['search', 'filter', 'summarize'],
        durationMs: 5000,
        status: 'success',
      });

      const history = loader.getExecutionHistory('test-skill');

      expect(history.length).toBe(1);
      expect(history[0].task).toBe('literature search');
      expect(history[0].status).toBe('success');
      expect(history[0].steps).toEqual(['search', 'filter', 'summarize']);
    });

    it('应按时间倒序返回历史', async () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'first task',
        steps: [],
        durationMs: 100,
        status: 'success',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'second task',
        steps: [],
        durationMs: 200,
        status: 'failed',
        error: 'test error',
      });

      const history = loader.getExecutionHistory('test-skill');

      expect(history.length).toBe(2);
      expect(history[0].task).toBe('second task');
      expect(history[1].task).toBe('first task');
    });

    it('应支持按状态筛选历史', () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'ok task',
        steps: [],
        durationMs: 100,
        status: 'success',
      });

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'failed task',
        steps: [],
        durationMs: 100,
        status: 'failed',
        error: 'error',
      });

      const successHistory = loader.getExecutionHistory('test-skill', { status: 'success' });
      expect(successHistory.length).toBe(1);
      expect(successHistory[0].task).toBe('ok task');

      const failedHistory = loader.getExecutionHistory('test-skill', { status: 'failed' });
      expect(failedHistory.length).toBe(1);
      expect(failedHistory[0].task).toBe('failed task');
    });

    it('应支持 limit 限制', () => {
      createFullSkill('test-skill');

      for (let i = 0; i < 5; i++) {
        loader.recordExecution({
          skillName: 'test-skill',
          task: `task-${i}`,
          steps: [],
          durationMs: 100,
          status: 'success',
        });
      }

      const history = loader.getExecutionHistory('test-skill', { limit: 3 });
      expect(history.length).toBe(3);
    });

    it('无执行记录的 skill 应返回空数组', () => {
      createFullSkill('test-skill');

      const history = loader.getExecutionHistory('test-skill');

      expect(history).toEqual([]);
    });

    it('应保存 tokenUsage', () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'task with tokens',
        steps: [],
        durationMs: 100,
        status: 'success',
        tokenUsage: { inputTokens: 1000, outputTokens: 500 },
      });

      const history = loader.getExecutionHistory('test-skill');

      expect(history[0].tokenUsage).toBeDefined();
      expect(history[0].tokenUsage!.inputTokens).toBe(1000);
      expect(history[0].tokenUsage!.outputTokens).toBe(500);
    });
  });

  // ============================================================
  // discover Phase 2: executionCount
  // ============================================================

  describe('discover Phase 2: executionCount', () => {
    it('discover 应返回 executionCount', () => {
      createFullSkill('test-skill');

      const metas = loader.discover();

      expect(metas.length).toBe(1);
      expect(metas[0].executionCount).toBe(0);
    });

    it('recordExecution 后 discover 应反映更新后的 executionCount', () => {
      createFullSkill('test-skill');

      loader.recordExecution({
        skillName: 'test-skill',
        task: 'task',
        steps: [],
        durationMs: 100,
        status: 'success',
      });

      const metas = loader.discover();

      expect(metas[0].executionCount).toBe(1);
    });

    it('discover 应返回 lastUpdated', () => {
      createFullSkill('test-skill');

      const metas = loader.discover();

      expect(metas[0].lastUpdated).toBeTruthy();
      // gray-matter parses unquoted YAML dates as Date objects
      expect(new Date(metas[0].lastUpdated as unknown as string).toISOString()).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});
