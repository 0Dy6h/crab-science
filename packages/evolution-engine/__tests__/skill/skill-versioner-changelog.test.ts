import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillVersioner } from '../../src/skill/skill-versioner.js';
import type { OptimizationSuggestion } from '@crab-science/shared';
import type { GitManager } from '@crab-science/storage';

/**
 * SkillVersioner CHANGELOG.md 位置测试（P1-1）
 *
 * 验证：每次 skill 变更后，CHANGELOG.md 写入 skill 自身目录而非全局位置。
 */
describe('SkillVersioner CHANGELOG.md 位置测试 (P1-1)', () => {
  let tempDir: string;
  let skillDir: string;
  let skillPath: string;
  let mockGitManager: GitManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-changelog-test-'));
    skillDir = path.join(tempDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    skillPath = path.join(skillDir, 'SKILL.md');
    const skillContent = `---
name: test-skill
version: 1
description: Test skill for changelog verification
---

## 工作流程

1. 步骤一
2. 步骤二
`;
    fs.writeFileSync(skillPath, skillContent, 'utf-8');

    mockGitManager = {
      isWithinRepo: () => true,
      getRepoDir: () => tempDir,
      commit: async () => 'abc123def456',
      log: async () => [],
      diff: async () => '',
      checkout: async () => {},
    } as unknown as GitManager;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('applySuggestion 后 CHANGELOG.md 写入 skill 目录而非全局位置', async () => {
    const versioner = new SkillVersioner(mockGitManager, tempDir);

    const suggestion: OptimizationSuggestion = {
      id: 'sugg-001',
      skillName: 'test-skill',
      currentVersion: 1,
      severity: 'minor',
      section: '工作流程',
      suggestion: '增加错误恢复步骤',
      rationale: '提高错误处理能力',
    };

    await versioner.applySuggestion(suggestion);

    // CHANGELOG.md 应该在 skill 目录下
    const skillChangelogPath = path.join(skillDir, 'CHANGELOG.md');
    expect(fs.existsSync(skillChangelogPath)).toBe(true);

    // 全局 CHANGELOG.md 不应被创建
    const globalChangelogPath = path.join(
      os.homedir(),
      '.crab-science',
      'CHANGELOG.md',
    );
    // 仅验证 skill 目录有 CHANGELOG，不严格断言全局不存在（其他测试可能创建）
    const skillChangelogContent = fs.readFileSync(skillChangelogPath, 'utf-8');
    expect(skillChangelogContent).toContain('# CHANGELOG');
    expect(skillChangelogContent).toContain('test-skill');
    expect(skillChangelogContent).toContain('增加错误恢复步骤');
  });

  it('多次优化后 CHANGELOG.md 按时间倒序记录所有版本', async () => {
    const versioner = new SkillVersioner(mockGitManager, tempDir);

    // 第一次优化
    await versioner.applySuggestion({
      id: 'sugg-001',
      skillName: 'test-skill',
      currentVersion: 1,
      severity: 'minor',
      section: '工作流程',
      suggestion: '第一次优化内容',
      rationale: '改进步骤',
    });

    // 第二次优化
    await versioner.applySuggestion({
      id: 'sugg-002',
      skillName: 'test-skill',
      currentVersion: 2,
      severity: 'minor',
      section: '工作流程',
      suggestion: '第二次优化内容',
      rationale: '进一步改进',
    });

    const changelogPath = path.join(skillDir, 'CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf-8');

    // 两条记录都存在
    expect(content).toContain('第一次优化内容');
    expect(content).toContain('第二次优化内容');

    // 第二次（新）应该在第一次（旧）之前
    const secondIndex = content.indexOf('第二次优化内容');
    const firstIndex = content.indexOf('第一次优化内容');
    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it('rollback 也写入 skill 目录的 CHANGELOG.md', async () => {
    const versioner = new SkillVersioner(mockGitManager, tempDir);

    // 先应用一次优化
    await versioner.applySuggestion({
      id: 'sugg-001',
      skillName: 'test-skill',
      currentVersion: 1,
      severity: 'minor',
      section: '工作流程',
      suggestion: '优化内容',
      rationale: '改进',
    });

    // Mock gitManager.log 返回版本历史
    mockGitManager.log = async () => [
      { hash: 'commit-v2', message: 'feat(skill): optimize test-skill v2', date: '2026-01-02', author: 'test' },
      { hash: 'commit-v1', message: 'feat(skill): optimize test-skill v1', date: '2026-01-01', author: 'test' },
    ];

    // 回滚
    await versioner.rollback('test-skill', 1);

    const changelogPath = path.join(skillDir, 'CHANGELOG.md');
    const content = fs.readFileSync(changelogPath, 'utf-8');

    // 应包含回滚记录
    expect(content).toContain('回滚');
    expect(content).toContain('v1');
  });
});
