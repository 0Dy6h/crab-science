import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  Skill,
  SkillMeta,
  SkillAttachment,
  SkillScript,
  SkillExecutionRecord,
} from '@crab-science/shared';
import {
  GLOBAL_SKILLS_DIR,
  PROJECT_SKILLS_DIR,
  expandTilde,
  generateId,
  nowISO,
} from '@crab-science/shared';
import type { SkillMetricsRepository } from '@crab-science/storage';
import type { SkillFrontmatter } from './types.js';
import { SkillExecutionLogger } from './execution-logger.js';

/**
 * Skill 加载器（Phase 2 增强）
 *
 * 实现 Progressive Disclosure：
 * - Level 0: discover() 返回 skill name + description（注入系统提示）
 * - Level 1: load(name) 返回完整 SKILL.md 内容（agent 按需 read）
 * - Level 2: loadAttachment(name, file) 加载附加参考文件
 * - Level 3: getScriptPath(name, script) 返回可执行脚本路径
 *
 * Phase 2 新增：
 * - 附加文件和脚本列表查询
 * - 增强元数据（含附加文件和脚本信息）
 * - 执行记录写入和查询
 */
export class SkillLoader {
  private skillsDirs: string[];
  private cache = new Map<string, Skill>();
  private executionLogger: SkillExecutionLogger;

  /**
   * @param skillsDirs - skill 搜索目录（可选）
   * @param projectRoot - 项目根目录（可选）
   * @param skillMetricsRepo - SQLite 仓库（可选，Phase 3 新增）
   */
  constructor(skillsDirs?: string[], projectRoot?: string, skillMetricsRepo?: SkillMetricsRepository) {
    if (skillsDirs && skillsDirs.length > 0) {
      this.skillsDirs = skillsDirs;
    } else {
      // 默认：项目级 skills + 全局 skills
      this.skillsDirs = [
        projectRoot
          ? path.join(projectRoot, PROJECT_SKILLS_DIR)
          : path.resolve(PROJECT_SKILLS_DIR),
        expandTilde(GLOBAL_SKILLS_DIR),
      ];
    }
    this.executionLogger = new SkillExecutionLogger(this.skillsDirs, skillMetricsRepo);
  }

  /**
   * 设置 SQLite 仓库（延迟注入，Phase 3 新增）
   */
  setSkillMetricsRepo(repo: SkillMetricsRepository): void {
    this.executionLogger.setSkillMetricsRepo(repo);
  }

  /**
   * 发现所有 Skills（Level 0）
   * 扫描所有 skillsDirs 下的 SKILL.md 文件，解析 YAML frontmatter
   * Phase 2: 解析 lastUpdated，读取 executionCount
   */
  discover(): SkillMeta[] {
    const metas: SkillMeta[] = [];
    const seen = new Set<string>();

    for (const dir of this.skillsDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMdPath)) continue;
        if (seen.has(entry.name)) continue; // 项目级优先

        try {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = matter(raw);
          const data = parsed.data as SkillFrontmatter;

          // Phase 2: 读取执行次数
          const executionCount = this.executionLogger.count(entry.name);

          const meta: SkillMeta = {
            name: data.name ?? entry.name,
            description: data.description ?? '',
            version: data.version ?? 1,
            lastUpdated: data.lastUpdated,
            executionCount,
          };

          metas.push(meta);
          seen.add(entry.name);
        } catch {
          // 跳过解析失败的文件
        }
      }
    }

    return metas;
  }

  /**
   * 加载完整 Skill（Level 1）
   * @param name - skill 名称
   * @returns Skill 完整对象，未找到返回 null
   */
  load(name: string): Skill | null {
    // 检查缓存
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // 在各目录中查找
    for (const dir of this.skillsDirs) {
      const skillMdPath = path.join(dir, name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        try {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = matter(raw);
          const data = parsed.data as SkillFrontmatter;

          const skill: Skill = {
            meta: {
              name: data.name ?? name,
              description: data.description ?? '',
              version: data.version ?? 1,
              lastUpdated: data.lastUpdated,
            },
            path: skillMdPath,
            content: raw,
          };

          this.cache.set(name, skill);
          return skill;
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * 获取格式化的 skill 元数据字符串（用于系统提示注入）
   */
  getMetadataForPrompt(): string {
    const metas = this.discover();
    if (metas.length === 0) return '';
    const lines = metas.map((m) => `- ${m.name}: ${m.description}`);
    return lines.join('\n');
  }

  /**
   * 获取 skill 文件路径（供 read 工具使用）
   */
  getSkillPath(name: string): string | null {
    for (const dir of this.skillsDirs) {
      const skillMdPath = path.join(dir, name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        return skillMdPath;
      }
    }
    return null;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================
  // Phase 2 新增方法
  // ============================================================

  /**
   * 查找 skill 目录路径
   * @param skillName - skill 名称
   * @returns skill 目录路径，未找到返回 null
   */
  private findSkillDir(skillName: string): string | null {
    for (const dir of this.skillsDirs) {
      const skillDir = path.join(dir, skillName);
      if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
        return skillDir;
      }
    }
    return null;
  }

  /**
   * 加载 Skill 附加文件（Level 2）
   * @param skillName - skill 名称
   * @param fileName - 附加文件名（如 'search-strategy.md'）
   * @returns 文件内容，未找到返回 null
   */
  loadAttachment(skillName: string, fileName: string): string | null {
    const skillDir = this.findSkillDir(skillName);
    if (!skillDir) return null;

    const filePath = path.join(skillDir, fileName);
    if (!fs.existsSync(filePath)) return null;

    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 获取 Skill 脚本路径（Level 3）
   * @param skillName - skill 名称
   * @param scriptName - 脚本名（如 'search.py'）
   * @returns 脚本完整路径，未找到返回 null
   */
  getScriptPath(skillName: string, scriptName: string): string | null {
    const skillDir = this.findSkillDir(skillName);
    if (!skillDir) return null;

    const filePath = path.join(skillDir, scriptName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  }

  /**
   * 列出 Skill 的所有附加文件
   * @param skillName - skill 名称
   * @returns 附加文件信息列表
   */
  listAttachments(skillName: string): SkillAttachment[] {
    const skillDir = this.findSkillDir(skillName);
    if (!skillDir) return [];

    const attachments: SkillAttachment[] = [];
    try {
      const entries = fs.readdirSync(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        // 附加文件：*.md 文件，排除 SKILL.md
        if (entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
          const filePath = path.join(skillDir, entry.name);
          const stat = fs.statSync(filePath);
          attachments.push({
            name: entry.name,
            path: filePath,
            size: stat.size,
          });
        }
      }
    } catch {
      // 目录读取失败，返回空
    }

    return attachments;
  }

  /**
   * 列出 Skill 的所有可执行脚本
   * @param skillName - skill 名称
   * @returns 脚本信息列表
   */
  listScripts(skillName: string): SkillScript[] {
    const skillDir = this.findSkillDir(skillName);
    if (!skillDir) return [];

    const scripts: SkillScript[] = [];
    try {
      const entries = fs.readdirSync(skillDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        // 脚本：*.py 或 *.sh 文件
        if (entry.name.endsWith('.py')) {
          scripts.push({
            name: entry.name.replace(/\.py$/, ''),
            path: path.join(skillDir, entry.name),
            language: 'python',
          });
        } else if (entry.name.endsWith('.sh')) {
          scripts.push({
            name: entry.name.replace(/\.sh$/, ''),
            path: path.join(skillDir, entry.name),
            language: 'shell',
          });
        }
      }
    } catch {
      // 目录读取失败，返回空
    }

    return scripts;
  }

  /**
   * 获取 Skill 的增强元数据（含附加文件和脚本列表）
   * 用于系统提示词中展示 skill 的完整能力
   * @param skillName - skill 名称
   * @returns 增强元数据，未找到返回 null
   */
  getEnhancedMeta(
    skillName: string,
  ):
    | (SkillMeta & {
        attachments: SkillAttachment[];
        scripts: SkillScript[];
      })
    | null {
    const skill = this.load(skillName);
    if (!skill) return null;

    const attachments = this.listAttachments(skillName);
    const scripts = this.listScripts(skillName);
    const executionCount = this.executionLogger.count(skillName);

    return {
      ...skill.meta,
      executionCount,
      attachments,
      scripts,
    };
  }

  /**
   * 记录 Skill 执行
   * @param record - 执行记录（不含 id 和 timestamp）
   */
  recordExecution(
    record: Omit<SkillExecutionRecord, 'id' | 'timestamp'>,
  ): void {
    this.executionLogger.log(record.skillName, record);
  }

  /**
   * 查询 Skill 执行历史
   * @param skillName - skill 名称
   * @param options - 查询选项（limit、状态筛选）
   * @returns 执行记录列表（按时间倒序）
   */
  getExecutionHistory(
    skillName: string,
    options?: {
      limit?: number;
      status?: SkillExecutionRecord['status'];
    },
  ): SkillExecutionRecord[] {
    return this.executionLogger.query(skillName, options);
  }
}
