// ============================================================
// Skill 数据结构
// SkillMeta 和 Skill 从 shared 导入
// Phase 2: SkillFrontmatter 新增 lastUpdated 字段
// Phase 3: SkillFrontmatter 新增 currentVersion, pendingValidation 字段
// ============================================================

export type { Skill, SkillMeta } from '@crab-science/shared';

/** Skill frontmatter 结构（Phase 3 增强） */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: number;
  /** 最后更新时间（Phase 2 新增，自动维护） */
  lastUpdated?: string;
  /** 当前版本号（Phase 3 新增，由 SkillVersioner 维护） */
  currentVersion?: number;
  /** 是否有待验证的新版本（Phase 3 新增） */
  pendingValidation?: boolean;
}
