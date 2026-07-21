import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitManager } from '../src/git-manager.js';

describe('GitManager', () => {
  let gitManager: GitManager;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-git-'));
    gitManager = new GitManager(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('应初始化 Git 仓库', async () => {
      await gitManager.initialize();
      expect(fs.existsSync(path.join(testDir, '.git'))).toBe(true);
    });

    it('重复初始化不应报错', async () => {
      await gitManager.initialize();
      await gitManager.initialize();
      expect(fs.existsSync(path.join(testDir, '.git'))).toBe(true);
    });
  });

  describe('isInitialized', () => {
    it('未初始化时返回 false', () => {
      expect(gitManager.isInitialized()).toBe(false);
    });

    it('初始化后返回 true', async () => {
      await gitManager.initialize();
      expect(gitManager.isInitialized()).toBe(true);
    });
  });

  describe('commit', () => {
    it('应提交文件并返回 commit hash', async () => {
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world', 'utf-8');

      const hash = await gitManager.commit(filePath, 'initial commit');
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    it('应提交多次并产生不同的 hash', async () => {
      const filePath = path.join(testDir, 'test.txt');

      fs.writeFileSync(filePath, 'version 1', 'utf-8');
      const hash1 = await gitManager.commit(filePath, 'commit 1');

      fs.writeFileSync(filePath, 'version 2', 'utf-8');
      const hash2 = await gitManager.commit(filePath, 'commit 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('log', () => {
    it('应返回文件的提交历史', async () => {
      const filePath = path.join(testDir, 'skill.md');
      fs.writeFileSync(filePath, 'v1 content', 'utf-8');
      await gitManager.commit(filePath, 'feat: v1');

      fs.writeFileSync(filePath, 'v2 content', 'utf-8');
      await gitManager.commit(filePath, 'feat: v2');

      const history = await gitManager.log(filePath, 10);
      expect(history).toHaveLength(2);
      expect(history[0].message).toContain('v2');
      expect(history[1].message).toContain('v1');
    });

    it('无历史时返回空数组', async () => {
      const filePath = path.join(testDir, 'no-commits.txt');
      fs.writeFileSync(filePath, 'content', 'utf-8');

      const history = await gitManager.log(filePath, 10);
      expect(history).toHaveLength(0);
    });
  });

  describe('checkout', () => {
    it('应恢复文件到指定版本', async () => {
      const filePath = path.join(testDir, 'skill.md');

      fs.writeFileSync(filePath, 'original content', 'utf-8');
      await gitManager.commit(filePath, 'feat: v1');

      fs.writeFileSync(filePath, 'modified content', 'utf-8');
      const hash2 = await gitManager.commit(filePath, 'feat: v2');

      // 回滚到 v1
      const history = await gitManager.log(filePath, 10);
      const v1Hash = history[1].hash;
      await gitManager.checkout(filePath, v1Hash);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('original content');
    });
  });

  describe('diff', () => {
    it('应返回两个版本之间的 diff', async () => {
      const filePath = path.join(testDir, 'skill.md');

      fs.writeFileSync(filePath, 'line1\nline2\nline3', 'utf-8');
      await gitManager.commit(filePath, 'feat: v1');

      fs.writeFileSync(filePath, 'line1\nline2-modified\nline3', 'utf-8');
      await gitManager.commit(filePath, 'feat: v2');

      const history = await gitManager.log(filePath, 10);
      const v1Hash = history[1].hash;

      const diffText = await gitManager.diff(filePath, v1Hash);
      expect(diffText).toContain('line2');
      expect(diffText).toContain('line2-modified');
    });
  });

  describe('getRepoDir', () => {
    it('应返回仓库目录', () => {
      expect(gitManager.getRepoDir()).toBe(testDir);
    });
  });
});
