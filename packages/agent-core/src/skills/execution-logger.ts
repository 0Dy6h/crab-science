import * as fs from 'fs';
import * as path from 'path';
import type { SkillExecutionRecord } from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { SkillMetricsRepository } from '@crab-science/storage';

/**
 * Skill 执行记录日志器（Phase 3 升级）
 *
 * Phase 3 策略：SQLite 优先，JSONL 回退
 * - 如果传入 SkillMetricsRepository（SQLite），写入 SQLite
 * - 否则回退到 JSONL 文件（Phase 2 兼容）
 *
 * 文件路径：{skillsDir}/{skillName}/executions.jsonl
 */
export class SkillExecutionLogger {
  private skillsDirs: string[];
  private skillMetricsRepo: SkillMetricsRepository | null;

  /**
   * @param skillsDirs - skill 搜索目录列表
   * @param skillMetricsRepo - SQLite 仓库（可选，Phase 3 新增）
   */
  constructor(
    skillsDirs: string[],
    skillMetricsRepo?: SkillMetricsRepository,
  ) {
    this.skillsDirs = skillsDirs;
    this.skillMetricsRepo = skillMetricsRepo ?? null;
  }

  /**
   * 设置 SQLite 仓库（延迟注入）
   */
  setSkillMetricsRepo(repo: SkillMetricsRepository): void {
    this.skillMetricsRepo = repo;
  }

  /**
   * 查找 skill 目录
   * @param skillName - skill 名称
   * @returns skill 目录路径，未找到返回 null
   */
  private findSkillDir(skillName: string): string | null {
    for (const dir of this.skillsDirs) {
      const skillDir = path.join(dir, skillName);
      if (fs.existsSync(skillDir)) {
        return skillDir;
      }
    }
    return null;
  }

  /**
   * 获取执行记录文件路径
   * @param skillName - skill 名称
   * @returns executions.jsonl 完整路径
   */
  getLogPath(skillName: string): string {
    const skillDir = this.findSkillDir(skillName);
    if (skillDir) {
      return path.join(skillDir, 'executions.jsonl');
    }
    // 默认使用第一个搜索目录
    const defaultDir = this.skillsDirs[0] || '.';
    return path.join(defaultDir, skillName, 'executions.jsonl');
  }

  /**
   * 记录 Skill 执行
   * Phase 3: SQLite 优先，JSONL 回退
   *
   * @param skillName - skill 名称
   * @param record - 执行记录（不含 id 和 timestamp，由本方法生成）
   */
  log(
    skillName: string,
    record: Omit<SkillExecutionRecord, 'id' | 'timestamp'>,
  ): void {
    // Phase 3: SQLite 优先
    if (this.skillMetricsRepo) {
      try {
        this.skillMetricsRepo.insertExecution(record);
        return;
      } catch (err) {
        console.error('[SkillExecutionLogger] SQLite 写入失败，回退到 JSONL:', err);
      }
    }

    // JSONL 回退
    this.logToJsonl(skillName, record);
  }

  /**
   * JSONL 写入（Phase 2 兼容）
   */
  private logToJsonl(
    skillName: string,
    record: Omit<SkillExecutionRecord, 'id' | 'timestamp'>,
  ): void {
    const fullRecord: SkillExecutionRecord = {
      ...record,
      id: generateId('exec'),
      timestamp: nowISO(),
    };

    const logPath = this.getLogPath(skillName);
    const dir = path.dirname(logPath);

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 追加写入 JSONL
    fs.appendFileSync(logPath, JSON.stringify(fullRecord) + '\n', 'utf-8');
  }

  /**
   * 查询 Skill 执行历史
   * Phase 3: SQLite 优先，JSONL 回退
   *
   * @param skillName - skill 名称
   * @param options - 查询选项（limit、状态筛选）
   * @returns 执行记录列表（按时间倒序）
   */
  query(
    skillName: string,
    options?: {
      limit?: number;
      status?: SkillExecutionRecord['status'];
    },
  ): SkillExecutionRecord[] {
    // Phase 3: SQLite 优先
    if (this.skillMetricsRepo) {
      try {
        return this.skillMetricsRepo.queryExecutions(skillName, {
          limit: options?.limit,
          status: options?.status,
        });
      } catch (err) {
        console.error('[SkillExecutionLogger] SQLite 查询失败，回退到 JSONL:', err);
      }
    }

    // JSONL 回退
    return this.queryFromJsonl(skillName, options);
  }

  /**
   * JSONL 查询（Phase 2 兼容）
   */
  private queryFromJsonl(
    skillName: string,
    options?: {
      limit?: number;
      status?: SkillExecutionRecord['status'];
    },
  ): SkillExecutionRecord[] {
    const logPath = this.getLogPath(skillName);
    if (!fs.existsSync(logPath)) {
      return [];
    }

    let raw: string;
    try {
      raw = fs.readFileSync(logPath, 'utf-8');
    } catch {
      return [];
    }

    const lines = raw.split('\n').filter((l) => l.trim());
    const records: SkillExecutionRecord[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as SkillExecutionRecord;
        // 状态筛选
        if (!options?.status || record.status === options.status) {
          records.push(record);
        }
      } catch {
        // 跳过损坏的行
      }
    }

    // 按时间倒序排列
    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // 应用 limit
    if (options?.limit && options.limit > 0) {
      return records.slice(0, options.limit);
    }

    return records;
  }

  /**
   * 获取执行次数
   * Phase 3: SQLite 优先，JSONL 回退
   *
   * @param skillName - skill 名称
   * @returns 执行记录总数
   */
  count(skillName: string): number {
    // Phase 3: SQLite 优先
    if (this.skillMetricsRepo) {
      try {
        const metrics = this.skillMetricsRepo.getMetrics(skillName);
        return metrics.usageCount;
      } catch (err) {
        console.error('[SkillExecutionLogger] SQLite 计数失败，回退到 JSONL:', err);
      }
    }

    // JSONL 回退
    return this.queryFromJsonl(skillName).length;
  }
}
