// ============================================================
// Skill 数据结构
// SkillMeta 和 Skill 从 shared 导入
// Phase 2: SkillFrontmatter 新增 lastUpdated 字段
// ============================================================

export type { Skill, SkillMeta } from '@crab-science/shared';

/** Skill frontmatter 结构（Phase 2 增强） */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: number;
  /** 最后更新时间（Phase 2 新增，自动维护） */
  lastUpdated?: string;
}
