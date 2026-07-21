import type { Session, Experience, TaskInfo } from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type { ExperienceRepository } from '@crab-science/storage';
import type { KnowledgeGraph } from './knowledge-graph.js';

/**
 * 经验提取器
 *
 * 从任务执行过程中提取经验，
 * 调用 LLM 分析执行路径，提取 key learnings 和 tags。
 */
export class ExperienceExtractor {
  private provider: LLMProvider;
  private experienceRepo: ExperienceRepository;
  private knowledgeGraph: KnowledgeGraph;

  constructor(
    provider: LLMProvider,
    experienceRepo: ExperienceRepository,
    knowledgeGraph: KnowledgeGraph,
  ) {
    this.provider = provider;
    this.experienceRepo = experienceRepo;
    this.knowledgeGraph = knowledgeGraph;
  }

  /**
   * 从任务执行过程提取经验
   * @param session - 当前 Session
   * @param taskInfo - 任务信息
   * @returns 提取的经验，失败返回 null
   */
  async extract(
    session: Session,
    taskInfo: TaskInfo,
  ): Promise<Experience | null> {
    try {
      // 分析执行过程
      const analysis = await this.analyzeExecution(session, taskInfo);

      if (!analysis) return null;

      // 构建 Experience 对象
      const experience: Omit<Experience, 'id'> = {
        timestamp: nowISO(),
        taskId: generateId('task'),
        sessionId: taskInfo.sessionId,
        task: taskInfo.task,
        skillUsed: taskInfo.skillUsed,
        subagentUsed: taskInfo.subagentUsed,
        outcome: taskInfo.outcome,
        duration: taskInfo.duration,
        keyLearnings: analysis.keyLearnings,
        tags: analysis.tags,
        relatedExperiences: [],
      };

      // 写入数据库
      const saved = this.experienceRepo.insert(experience);

      // 知识图谱建边
      this.knowledgeGraph.buildEdgesForExperience(saved);

      return saved;
    } catch (err) {
      console.error('[ExperienceExtractor] 提取经验失败:', err);
      return null;
    }
  }

  /**
   * 调用 LLM 分析执行过程，提取 key learnings 和 tags
   * @param session - 当前 Session
   * @param taskInfo - 任务信息
   * @returns key learnings 和 tags
   */
  private async analyzeExecution(
    session: Session,
    taskInfo: TaskInfo,
  ): Promise<{ keyLearnings: string[]; tags: string[] } | null> {
    // 提取执行路径消息
    const pathNodes = this.getPathNodes(session);
    if (pathNodes.length === 0) return null;

    // 拼接为文本（截断防止 token 过多）
    const executionText = pathNodes
      .map((node) => {
        const content =
          typeof node.content === 'string'
            ? node.content
            : JSON.stringify(node.content);
        const truncated = content.substring(0, 200);
        const role = node.type;
        return `[${role}] ${truncated}`;
      })
      .join('\n')
      .substring(0, 3000);

    const prompt = `分析以下任务执行过程，提取 key learnings（每条 < 100 字）和 tags（关键词标签）。

## 任务
${taskInfo.task}

## 执行结果
${taskInfo.outcome}

## 使用的工具
${taskInfo.toolsUsed.join(', ') || '无'}

## 使用的 Skill
${taskInfo.skillUsed ?? '无'}

## 执行过程
${executionText}

请返回一个 JSON 对象（不要包含其他文本）：
{
  "keyLearnings": ["学习点1", "学习点2", "学习点3"],
  "tags": ["标签1", "标签2", "标签3"]
}

注意：
- keyLearnings 最多 5 条，每条不超过 100 字
- tags 最多 5 个，用于分类和检索
- 从执行过程中提取有价值的经验教训`;

    const options: LLMOptions = {
      model: '',
      systemPrompt: '你是一个经验提取专家。请分析任务执行过程并提取经验。',
      temperature: 0.3,
      maxTokens: 512,
    };

    let result = '';
    try {
      const stream = this.provider.complete(
        [{ role: 'user', content: prompt }],
        options,
      );

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          result += event.content;
        }
      }
    } catch (err) {
      console.error('[ExperienceExtractor] LLM 调用失败:', err);
      return null;
    }

    return this.parseAnalysisResponse(result);
  }

  /**
   * 解析 LLM 返回的分析结果
   */
  private parseAnalysisResponse(
    response: string,
  ): { keyLearnings: string[]; tags: string[] } | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        keyLearnings: string[];
        tags: string[];
      };

      return {
        keyLearnings: Array.isArray(parsed.keyLearnings)
          ? parsed.keyLearnings.slice(0, 5)
          : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取从 root 到 currentNodeId 的路径节点
   */
  private getPathNodes(session: Session): Session['nodes'][string][] {
    if (!session.rootId || !session.currentNodeId) return [];

    const path: Session['nodes'][string][] = [];
    let currentId: string | null = session.currentNodeId;

    while (currentId && session.nodes[currentId]) {
      path.unshift(session.nodes[currentId]);
      if (currentId === session.rootId) break;
      currentId = session.nodes[currentId].parentId;
    }

    return path;
  }
}
