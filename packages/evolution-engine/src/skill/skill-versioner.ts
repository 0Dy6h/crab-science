import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  OptimizationSuggestion,
  ChangeEntry,
  GitLogEntry,
} from '@crab-science/shared';
import { nowISO, expandTilde } from '@crab-science/shared';
import type { GitManager } from '@crab-science/storage';

/**
 * Skill 版本迭代器
 *
 * 职责：
 * 1. 采纳优化建议，修改 SKILL.md
 * 2. 版本号 +1，更新 frontmatter
 * 3. Git commit 记录变更
 * 4. 追加 CHANGELOG.md
 * 5. 回滚到指定版本
 */
export class SkillVersioner {
  private gitManager: GitManager;
  private workDir: string;

  constructor(gitManager: GitManager, workDir?: string) {
    this.gitManager = gitManager;
    this.workDir = workDir ?? process.cwd();
  }

  /**
   * 采纳建议并创建新版本
   * @param suggestion - 优化建议
   * @returns 新版本号和 commit hash
   */
  async applySuggestion(
    suggestion: OptimizationSuggestion,
  ): Promise<{ newVersion: number; commitHash: string }> {
    const skillPath = this.findSkillPath(suggestion.skillName);
    if (!skillPath) {
      throw new Error(`Skill 文件未找到: ${suggestion.skillName}`);
    }

    // 安全前置校验：只有位于进化 Git 仓库内的 Skill 才允许自我修改，
    // 否则一旦改动就无法回滚（且旧实现会把仓库外文件塌缩成 basename 提交，污染历史）。
    if (!this.gitManager.isWithinRepo(skillPath)) {
      throw new Error(
        `Skill "${suggestion.skillName}" 不在进化 Git 仓库内（${this.gitManager.getRepoDir()}），拒绝自我修改以保证可回滚`,
      );
    }

    // 读取当前内容
    const raw = fs.readFileSync(skillPath, 'utf-8');
    const parsed = matter(raw);

    // 获取当前版本号
    const currentVersion = (parsed.data.version as number) ?? 1;
    const newVersion = currentVersion + 1;

    // 应用修改：在对应段落末尾追加优化建议
    const modifiedContent = this.applyModification(
      parsed.content,
      suggestion,
    );

    // 更新 frontmatter
    parsed.data.version = newVersion;
    parsed.data.lastUpdated = nowISO();

    // 序列化回 Markdown
    const newRaw = matter.stringify(modifiedContent, parsed.data);

    // 写回文件
    fs.writeFileSync(skillPath, newRaw, 'utf-8');

    // Git commit
    const commitMessage = `feat(skill): optimize ${suggestion.skillName} v${newVersion}`;
    const commitHash = await this.gitManager.commit(skillPath, commitMessage);

    // 追加 CHANGELOG
    const changeEntry: ChangeEntry = {
      type: 'skill_optimize',
      target: suggestion.skillName,
      version: newVersion,
      description: suggestion.suggestion,
      commitHash,
      timestamp: nowISO(),
    };
    this.appendChangelog(changeEntry);

    return { newVersion, commitHash };
  }

  /**
   * 回滚到指定版本
   * @param skillName - Skill 名称
   * @param targetVersion - 目标版本号
   * @returns commit hash
   */
  async rollback(skillName: string, targetVersion: number): Promise<string> {
    const skillPath = this.findSkillPath(skillName);
    if (!skillPath) {
      throw new Error(`Skill 文件未找到: ${skillName}`);
    }

    // 获取版本历史
    const history = await this.gitManager.log(skillPath, 50);

    // 找到目标版本的 commit
    const targetCommit = history.find((entry) => {
      return entry.message.includes(`v${targetVersion}`);
    });

    if (!targetCommit) {
      throw new Error(`版本 v${targetVersion} 的 commit 未找到`);
    }

    // Git checkout 恢复文件
    await this.gitManager.checkout(skillPath, targetCommit.hash);

    // 重新 commit 回滚操作
    const rollbackMessage = `fix(skill): rollback ${skillName} to v${targetVersion}`;
    const commitHash = await this.gitManager.commit(skillPath, rollbackMessage);

    // 追加 CHANGELOG
    const changeEntry: ChangeEntry = {
      type: 'skill_rollback',
      target: skillName,
      version: targetVersion,
      description: `回滚到 v${targetVersion}`,
      commitHash,
      timestamp: nowISO(),
    };
    this.appendChangelog(changeEntry);

    return commitHash;
  }

  /**
   * 获取版本 diff
   * @param skillName - Skill 名称
   * @param fromVersion - 起始版本（可选）
   * @returns diff 文本
   */
  async getDiff(skillName: string, fromVersion?: number): Promise<string> {
    const skillPath = this.findSkillPath(skillName);
    if (!skillPath) return '';

    if (fromVersion) {
      const history = await this.gitManager.log(skillPath, 50);
      const targetCommit = history.find((entry) =>
        entry.message.includes(`v${fromVersion}`),
      );
      if (targetCommit) {
        return this.gitManager.diff(skillPath, targetCommit.hash);
      }
    }

    return this.gitManager.diff(skillPath);
  }

  /**
   * 获取版本历史
   * @param skillName - Skill 名称
   * @returns GitLogEntry 数组
   */
  async getVersionHistory(skillName: string): Promise<GitLogEntry[]> {
    const skillPath = this.findSkillPath(skillName);
    if (!skillPath) return [];
    return this.gitManager.log(skillPath, 50);
  }

  /**
   * 查找 Skill 文件路径
   */
  private findSkillPath(skillName: string): string | null {
    const possiblePaths = [
      path.join(this.workDir, 'skills', skillName, 'SKILL.md'),
      expandTilde(`~/.crab-science/skills/${skillName}/SKILL.md`),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * 应用修改到 SKILL.md 内容
   * 在对应段落末尾追加优化建议
   */
  private applyModification(
    content: string,
    suggestion: OptimizationSuggestion,
  ): string {
    const section = (suggestion.section ?? '').trim();
    const noteText = `\n> [自动优化 v${suggestion.currentVersion + 1}] ${suggestion.suggestion}`;

    // 段落名为空时不做模糊匹配（否则 includes('') 恒真会命中首行），直接追加到文件末尾
    if (!section) {
      return content + `\n\n## 自动优化${noteText}`;
    }

    // 尝试找到对应段落
    const sectionHeader = `## ${section}`;
    const lines = content.split('\n');

    let sectionIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith(sectionHeader) ||
          lines[i].trim() === `#${section}` ||
          lines[i].toLowerCase().includes(section.toLowerCase())) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex >= 0) {
      // 找到段落下一个小标题或文件末尾
      let insertIndex = sectionIndex + 1;
      while (insertIndex < lines.length && !lines[insertIndex].startsWith('## ')) {
        insertIndex++;
      }
      lines.splice(insertIndex, 0, noteText);
      return lines.join('\n');
    }

    // 未找到段落，追加到文件末尾
    return content + `\n\n## ${section}${noteText}`;
  }

  /**
   * 追加 CHANGELOG 条目
   */
  private appendChangelog(entry: ChangeEntry): void {
    const changelogPath = expandTilde('~/.crab-science/CHANGELOG.md');

    const dir = path.dirname(changelogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = `- [${entry.type}] ${entry.target} v${entry.version}: ${entry.description}${entry.commitHash ? ` (${entry.commitHash.substring(0, 8)})` : ''} — ${entry.timestamp}\n`;

    let existingContent = '';
    if (fs.existsSync(changelogPath)) {
      existingContent = fs.readFileSync(changelogPath, 'utf-8');
    }

    // 按时间倒序：新条目在前面
    const header = existingContent.startsWith('# ')
      ? ''
      : '# CHANGELOG\n\n';
    const newContent = header + line + existingContent.replace(/^# CHANGELOG\n*/, '');

    fs.writeFileSync(changelogPath, newContent, 'utf-8');
  }
}
