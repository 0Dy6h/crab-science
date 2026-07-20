// ============================================================
// Skill 数据结构
// SkillMeta 和 Skill 从 shared 导入
// ============================================================

export type { Skill, SkillMeta } from '@crab-science/shared';

/** Skill frontmatter 结构 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: number;
}
