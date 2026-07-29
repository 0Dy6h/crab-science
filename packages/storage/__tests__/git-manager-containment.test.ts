import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitManager, PathOutsideRepoError } from '../src/git-manager.js';

/**
 * GitManager 路径 containment 回归测试 (WD-1 / SEC-02)
 *
 * 旧实现会把仓库外路径静默塌缩为 basename，导致 skills/foo/SKILL.md 被提交成
 * 仓库根的 SKILL.md，污染版本历史。现在改为明确拒绝。
 */
describe('GitManager 路径 containment', () => {
  let gitManager: GitManager;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-git-c-'));
    gitManager = new GitManager(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('isWithinRepo: 仓库内路径为 true，仓库外为 false', () => {
    expect(gitManager.isWithinRepo(path.join(testDir, 'skills', 'x', 'SKILL.md'))).toBe(true);
    expect(gitManager.isWithinRepo(path.join(os.tmpdir(), 'somewhere-else', 'a.md'))).toBe(false);
    // repoDir 自身不算“文件”
    expect(gitManager.isWithinRepo(testDir)).toBe(false);
  });

  it('提交仓库外的文件应抛 PathOutsideRepoError（而不是塌缩为 basename）', async () => {
    await gitManager.initialize();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-outside-'));
    const outsideFile = path.join(outside, 'SKILL.md');
    fs.writeFileSync(outsideFile, 'content', 'utf-8');
    try {
      await expect(gitManager.commit(outsideFile, 'msg')).rejects.toBeInstanceOf(
        PathOutsideRepoError,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('提交仓库内的嵌套文件应成功并保留嵌套路径', async () => {
    await gitManager.initialize();
    const nested = path.join(testDir, 'skills', 'lit', 'SKILL.md');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, 'v1', 'utf-8');
    const hash = await gitManager.commit(nested, 'feat: v1');
    expect(hash).toBeTruthy();
    // 历史应能按嵌套路径查回该文件
    const log = await gitManager.log(nested, 5);
    expect(log.length).toBeGreaterThan(0);
  });
});
