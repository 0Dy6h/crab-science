import type { Experience } from '@crab-science/shared';
import type {
  ExperienceRepository,
  KnowledgeRepository,
} from '@crab-science/storage';

/**
 * 知识图谱构建器
 *
 * 为新经验建立关联边：
 * - 同 tag 的经验建立 same_tag 边
 * - 同 skill 的经验建立 same_skill 边
 * - 同 subagent 的经验建立 same_subagent 边
 *
 * 边权重：共享 tag 数量
 */
export class KnowledgeGraph {
  private knowledgeRepo: KnowledgeRepository;
  private experienceRepo: ExperienceRepository;

  constructor(
    knowledgeRepo: KnowledgeRepository,
    experienceRepo: ExperienceRepository,
  ) {
    this.knowledgeRepo = knowledgeRepo;
    this.experienceRepo = experienceRepo;
  }

  /**
   * 为新经验建立关联边
   * @param experience - 新插入的经验
   */
  buildEdgesForExperience(experience: Experience): void {
    // 1. 按 tag 建边
    if (experience.tags.length > 0) {
      const sameTagExperiences = this.experienceRepo.findByTags(
        experience.tags,
        50,
      );

      for (const existing of sameTagExperiences) {
        if (existing.id === experience.id) continue;

        // 计算共享 tag 数量作为权重
        const sharedTags = experience.tags.filter((t) =>
          existing.tags.includes(t),
        );
        const weight = sharedTags.length;

        if (weight > 0) {
          // 检查边是否已存在
          if (
            !this.knowledgeRepo.edgeExists(
              experience.id,
              existing.id,
              'same_tag',
            )
          ) {
            try {
              this.knowledgeRepo.addEdge({
                sourceId: experience.id,
                targetId: existing.id,
                type: 'same_tag',
                weight,
              });
            } catch (err) {
              // 跳过建边失败
              console.error('[KnowledgeGraph] 建边失败:', err);
            }
          }
        }
      }
    }

    // 2. 按 skill 建边
    if (experience.skillUsed) {
      const sameSkillExperiences = this.experienceRepo.findBySkill(
        experience.skillUsed,
        50,
      );

      for (const existing of sameSkillExperiences) {
        if (existing.id === experience.id) continue;

        if (
          !this.knowledgeRepo.edgeExists(
            experience.id,
            existing.id,
            'same_skill',
          )
        ) {
          try {
            this.knowledgeRepo.addEdge({
              sourceId: experience.id,
              targetId: existing.id,
              type: 'same_skill',
              weight: 1,
            });
          } catch (err) {
            console.error('[KnowledgeGraph] 建边失败:', err);
          }
        }
      }
    }

    // 3. 按 subagent 建边
    if (experience.subagentUsed) {
      const allExperiences = this.experienceRepo.getRecent(100);
      const sameSubagentExperiences = allExperiences.filter(
        (e) =>
          e.subagentUsed === experience.subagentUsed &&
          e.id !== experience.id,
      );

      for (const existing of sameSubagentExperiences) {
        if (
          !this.knowledgeRepo.edgeExists(
            experience.id,
            existing.id,
            'same_subagent',
          )
        ) {
          try {
            this.knowledgeRepo.addEdge({
              sourceId: experience.id,
              targetId: existing.id,
              type: 'same_subagent',
              weight: 1,
            });
          } catch (err) {
            console.error('[KnowledgeGraph] 建边失败:', err);
          }
        }
      }
    }
  }

  /**
   * 查询相关经验（基于边权重）
   * @param experienceId - 经验 ID
   * @param limit - 最大返回数量
   * @returns 相关经验数组
   */
  findRelated(experienceId: string, limit = 10): Experience[] {
    return this.knowledgeRepo.findRelated(experienceId, limit);
  }
}
