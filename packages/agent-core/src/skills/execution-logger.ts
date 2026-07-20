import * as fs from 'fs';
import * as path from 'path';
import type { SkillExecutionRecord } from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';

/**
 * Skill 执行记录日志器
 *
 * 使用 JSONL 格式存储执行记录，每行一个 JSON 对象。
 * 文件路径：{skillsDir}/{skillName}/executions.jsonl
 *
 * Phase 2 使用 JSONL，Phase 3 迁移 SQLite。
 */
export class SkillExecutionLogger {
  private skillsDirs: string[];

  /**
   * @param skillsDirs - skill 搜索目录列表
   */
  constructor(skillsDirs: string[]) {
    this.skillsDirs = skillsDirs;
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
   * @param skillName - skill 名称
   * @param record - 执行记录（不含 id 和 timestamp，由本方法生成）
   */
  log(
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
   * @param skillName - skill 名称
   * @returns 执行记录总数
   */
  count(skillName: string): number {
    return this.query(skillName).length;
  }
}
