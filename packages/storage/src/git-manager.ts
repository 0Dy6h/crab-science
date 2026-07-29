import * as fs from 'fs';
import * as path from 'path';
import git from 'isomorphic-git';
import type { GitLogEntry } from '@crab-science/shared';
import { CONFIG_DIR, expandTilde } from '@crab-science/shared';

/** Git 作者信息 */
const GIT_AUTHOR = {
  name: 'Crab-Science Evolution',
  email: 'evolution@crab-science.local',
};

/**
 * 目标文件不在 Git 仓库目录内时抛出。
 * 让调用方能够明确处理“该文件不受版本控制”而非静默写坏历史。
 */
export class PathOutsideRepoError extends Error {
  constructor(
    public readonly targetPath: string,
    public readonly repoDir: string,
  ) {
    super(`路径不在 Git 仓库内，拒绝提交: ${targetPath}（仓库: ${repoDir}）`);
    this.name = 'PathOutsideRepoError';
  }
}

/**
 * Git 版本管理器
 *
 * 使用 isomorphic-git 在 ~/.crab-science/ 维护 Git 仓库，
 * 用于 Skill/Subagent 的版本控制。
 */
export class GitManager {
  private repoDir: string;
  private fs: typeof fs;

  constructor(repoDir?: string) {
    this.repoDir = expandTilde(repoDir ?? CONFIG_DIR);
    this.fs = fs;
  }

  /**
   * 初始化 Git 仓库（如果不存在）
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.repoDir)) {
      fs.mkdirSync(this.repoDir, { recursive: true });
    }

    if (!this.isInitialized()) {
      await git.init({
        fs: this.fs,
        dir: this.repoDir,
      });
    }
  }

  /**
   * 检查仓库是否已初始化
   */
  isInitialized(): boolean {
    const gitDir = path.join(this.repoDir, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * 添加文件并提交
   * @param filePath - 文件路径（相对于 repoDir 或绝对路径）
   * @param message - 提交信息
   * @returns commit hash
   */
  async commit(filePath: string, message: string): Promise<string> {
    await this.initialize();

    const relativePath = this.toRelativePath(filePath);

    await git.add({
      fs: this.fs,
      dir: this.repoDir,
      filepath: relativePath,
    });

    const commitHash = await git.commit({
      fs: this.fs,
      dir: this.repoDir,
      message,
      author: GIT_AUTHOR,
    });

    return commitHash;
  }

  /**
   * 添加多个文件并提交
   * @param filePaths - 文件路径数组
   * @param message - 提交信息
   * @returns commit hash
   */
  async commitMultiple(filePaths: string[], message: string): Promise<string> {
    await this.initialize();

    for (const filePath of filePaths) {
      const relativePath = this.toRelativePath(filePath);
      await git.add({
        fs: this.fs,
        dir: this.repoDir,
        filepath: relativePath,
      });
    }

    const commitHash = await git.commit({
      fs: this.fs,
      dir: this.repoDir,
      message,
      author: GIT_AUTHOR,
    });

    return commitHash;
  }

  /**
   * 获取文件 diff
   * @param filePath - 文件路径
   * @param fromHash - 起始 commit hash（可选，默认上一个 commit）
   * @returns diff 文本
   */
  async diff(filePath: string, fromHash?: string): Promise<string> {
    await this.initialize();

    const relativePath = this.toRelativePath(filePath);

    // 获取文件历史
    const logs = await this.log(filePath, 2);

    if (logs.length === 0) {
      return '';
    }

    const targetHash = fromHash ?? logs[logs.length - 1].hash;

    try {
      // 获取目标版本的文件内容
      const oldContent = await git.readBlob({
        fs: this.fs,
        dir: this.repoDir,
        oid: targetHash,
        filepath: relativePath,
      });

      const oldText = Buffer.from(oldContent.blob).toString('utf-8');

      // 获取当前文件内容
      let newText = '';
      const absPath = path.join(this.repoDir, relativePath);
      if (fs.existsSync(absPath)) {
        newText = fs.readFileSync(absPath, 'utf-8');
      }

      // 生成简单 diff
      return this.generateSimpleDiff(oldText, newText, relativePath);
    } catch {
      // 文件在目标 commit 中不存在
      const absPath = path.join(this.repoDir, relativePath);
      if (fs.existsSync(absPath)) {
        const newText = fs.readFileSync(absPath, 'utf-8');
        return `--- /dev/null\n+++ ${relativePath}\n${newText}`;
      }
      return '';
    }
  }

  /**
   * 回滚文件到指定 commit
   * @param filePath - 文件路径
   * @param commitHash - 目标 commit hash
   */
  async checkout(filePath: string, commitHash: string): Promise<void> {
    await this.initialize();

    const relativePath = this.toRelativePath(filePath);

    // 读取目标版本的文件内容
    const blob = await git.readBlob({
      fs: this.fs,
      dir: this.repoDir,
      oid: commitHash,
      filepath: relativePath,
    });

    const content = Buffer.from(blob.blob).toString('utf-8');

    // 写回文件
    const absPath = path.join(this.repoDir, relativePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absPath, content, 'utf-8');

    // 重新 add
    await git.add({
      fs: this.fs,
      dir: this.repoDir,
      filepath: relativePath,
    });
  }

  /**
   * 获取文件提交历史
   * @param filePath - 文件路径
   * @param limit - 最大返回数量
   * @returns GitLogEntry 数组（按时间倒序）
   */
  async log(filePath: string, limit = 20): Promise<GitLogEntry[]> {
    await this.initialize();

    const relativePath = this.toRelativePath(filePath);

    try {
      const commits = await git.log({
        fs: this.fs,
        dir: this.repoDir,
        filepath: relativePath,
        depth: limit,
        ref: 'HEAD',
      });

      return commits.map((c) => ({
        hash: c.oid,
        message: c.commit.message,
        author: c.commit.author.name,
        timestamp: new Date(c.commit.author.timestamp * 1000).toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取仓库目录
   */
  getRepoDir(): string {
    return this.repoDir;
  }

  /**
   * 判断文件是否位于仓库目录内（不抛错版本，供调用方在写入前预检）。
   */
  isWithinRepo(filePath: string): boolean {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);
    const relative = path.relative(this.repoDir, absPath);
    return (
      relative !== '' &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  }

  /**
   * 将文件路径转换为相对于 repoDir 的路径。
   * repoDir 之外的路径会被明确拒绝，而不是静默塌缩为 basename——
   * 后者会把 skills/foo/SKILL.md 提交成仓库根的 SKILL.md，污染版本历史。
   */
  private toRelativePath(filePath: string): string {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);

    const relative = path.relative(this.repoDir, absPath);

    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new PathOutsideRepoError(absPath, this.repoDir);
    }

    // 统一使用正斜杠（isomorphic-git 要求），且在 POSIX 上也正确
    return relative.split(path.sep).join('/');
  }

  /**
   * 生成简单的 diff 文本
   */
  private generateSimpleDiff(
    oldText: string,
    newText: string,
    filePath: string,
  ): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        // 相同行不显示
        continue;
      }

      if (oldLine !== undefined && newLine === undefined) {
        lines.push(`-${oldLine}`);
      } else if (oldLine === undefined && newLine !== undefined) {
        lines.push(`+${newLine}`);
      } else {
        lines.push(`-${oldLine}`);
        lines.push(`+${newLine}`);
      }
    }

    return lines.join('\n');
  }
}
