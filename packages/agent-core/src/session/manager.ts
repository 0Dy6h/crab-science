import * as fs from 'fs';
import * as path from 'path';
import type {
  Session,
  SessionMeta,
  Message,
  SessionNode,
  NodeType,
  NodeMetadata,
} from '@crab-science/shared';
import {
  SESSIONS_DIR,
  generateId,
  expandTilde,
  nowISO,
  truncateOutput,
} from '@crab-science/shared';
import type { LLMProvider, LLMOptions } from '@crab-science/llm-layer';
import type {
  CreateSessionOptions,
  ForkOptions,
  BranchInfo,
  TreeStructure,
} from './types.js';
import { TreeUtils } from './tree-utils.js';

/**
 * Session 管理器（Phase 2 树形结构）
 *
 * 职责：
 * - 创建、加载、保存、列出、删除 Session（树形结构）
 * - 节点追加（addNode）
 * - 分支操作（fork / rollback / jump / summarize）
 * - 路径提取（getPath / getCurrentPathMessages）
 * - V1 → V2 自动迁移
 *
 * Session 全量 JSON 序列化到 ~/.crab-science/sessions/{id}.json
 */
export class SessionManager {
  private sessionsDir: string;
  private provider?: LLMProvider;

  /**
   * @param sessionsDir - session 存储目录
   * @param provider - 可选 LLMProvider（用于 summarize 功能）
   */
  constructor(sessionsDir?: string, provider?: LLMProvider) {
    this.sessionsDir = expandTilde(sessionsDir ?? SESSIONS_DIR);
    this.provider = provider;
  }

  /** 确保目录存在 */
  private ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /** 获取 session 文件路径 */
  private getFilePath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  // ============================================================
  // Phase 1 保留方法（适配树形）
  // ============================================================

  /**
   * 创建新 Session（树形）
   * 初始状态：空节点 Map，rootId 和 currentNodeId 为空字符串
   * 第一个 addNode 调用会创建根节点
   */
  create(options: CreateSessionOptions): Session {
    const now = nowISO();
    const session: Session = {
      id: generateId('sess'),
      nodes: {},
      rootId: '',
      currentNodeId: '',
      model: options.model,
      provider: options.provider,
      createdAt: now,
      updatedAt: now,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      version: 2,
    };
    this.save(session);
    return session;
  }

  /**
   * 从 JSON 文件加载 Session
   * 自动检测版本：V1（线性）自动迁移为 V2（树形）
   * @returns Session 对象，文件损坏时返回 null
   */
  load(id: string): Session | null {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const obj = JSON.parse(raw) as Record<string, unknown>;

      // V1 迁移检测：version === 1 或存在 messages 字段且无 nodes 字段
      const isV1 =
        obj.version === 1 ||
        (!obj.nodes && Array.isArray(obj.messages));

      if (isV1) {
        const migrated = this.migrateFromV1(
          obj as unknown as Session & { messages: Message[] },
        );
        // 覆盖保存迁移后的 Session
        this.save(migrated);
        return migrated;
      }

      return obj as unknown as Session;
    } catch (err) {
      console.error(
        `[SessionManager] 加载 session ${id} 失败: ${err}`,
      );
      return null;
    }
  }

  /**
   * 保存 Session（全量 JSON 序列化）
   */
  save(session: Session): void {
    this.ensureDir();
    session.updatedAt = nowISO();
    const filePath = this.getFilePath(session.id);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * 列出所有历史 Session
   * 兼容 V1 和 V2 格式
   */
  list(): SessionMeta[] {
    this.ensureDir();
    const files = fs
      .readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith('.json'));
    const metas: SessionMeta[] = [];

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const session = JSON.parse(raw) as Record<string, unknown>;

        // 兼容 V1 和 V2 格式计算节点数
        const nodeCount = session.nodes
          ? Object.keys(session.nodes as Record<string, unknown>).length
          : Array.isArray(session.messages)
            ? (session.messages as unknown[]).length
            : 0;

        metas.push({
          id: session.id as string,
          createdAt: session.createdAt as string,
          updatedAt: session.updatedAt as string,
          model: session.model as string,
          provider: session.provider as string,
          nodeCount,
          version: (session.version as number) ?? 1,
        });
      } catch {
        // 跳过损坏的文件
      }
    }

    // 按更新时间倒序
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  /**
   * 删除 Session
   */
  delete(id: string): void {
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ============================================================
  // Phase 2 方法升级
  // ============================================================

  /**
   * 添加节点到当前节点
   * 新节点作为 currentNodeId 的子节点，currentNodeId 更新为新节点
   * 如果是第一个节点（rootId 为空），则成为根节点
   *
   * @param session - 当前 Session
   * @param node - 节点数据（不含 id、parentId、timestamp、childrenIds）
   * @returns 新节点 ID
   */
  addNode(
    session: Session,
    node: Omit<SessionNode, 'id' | 'parentId' | 'timestamp' | 'childrenIds'>,
  ): string {
    const nodeId = generateId('node');
    const timestamp = nowISO();

    const newNode: SessionNode = {
      ...node,
      id: nodeId,
      parentId: session.currentNodeId || null,
      timestamp,
      childrenIds: [],
      metadata: node.metadata || {},
    };

    session.nodes[nodeId] = newNode;

    // 如果是第一个节点，设为根节点
    if (!session.rootId) {
      session.rootId = nodeId;
      newNode.parentId = null;
    } else if (session.currentNodeId) {
      // 添加为当前节点的子节点
      const parentNode = session.nodes[session.currentNodeId];
      if (parentNode) {
        parentNode.childrenIds.push(nodeId);
      }
    }

    session.currentNodeId = nodeId;
    session.updatedAt = timestamp;
    return nodeId;
  }

  /**
   * 更新 Session 的 token 统计
   */
  updateUsage(
    session: Session,
    inputTokens: number,
    outputTokens: number,
    cost: number,
  ): void {
    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.totalCost += cost;
  }

  /**
   * 获取 Session 摘要（从当前路径末尾取 N 个节点）
   * @param maxNodes - 最多返回的节点数
   */
  getSummary(session: Session, maxNodes = 5): string {
    if (!session.currentNodeId || !session.rootId) {
      return '';
    }

    const fullPath = TreeUtils.getPath(
      session.nodes,
      session.rootId,
      session.currentNodeId,
    );
    const recentNodes = fullPath.slice(-maxNodes);

    const lines = recentNodes.map((node) => {
      const role =
        node.type === 'user'
          ? 'You'
          : node.type === 'assistant'
            ? 'Crab'
            : node.type === 'summary'
              ? 'Summary'
              : node.type;
      const content =
        typeof node.content === 'string'
          ? node.content
          : JSON.stringify(node.content);
      return `${role}: ${truncateOutput(content, 3)}`;
    });

    return lines.join('\n');
  }

  // ============================================================
  // Phase 2 新增方法
  // ============================================================

  /**
   * Fork 分支
   *
   * 不改变 currentNodeId，后续 addNode 自然形成新分支。
   * 如果当前节点已有子节点，新 addNode 会创建新的分支。
   * 如果当前节点是叶节点，新 addNode 只是延伸当前路径。
   *
   * @param session - 当前 Session
   * @param options - Fork 选项
   * @returns Fork 起点节点 ID
   */
  fork(session: Session, options?: ForkOptions): string {
    const fromNodeId = options?.fromNodeId ?? session.currentNodeId;

    if (!fromNodeId || !session.nodes[fromNodeId]) {
      throw new Error(`Fork 目标节点不存在: ${fromNodeId}`);
    }

    // 在起点节点记录分支原因
    if (options?.reason) {
      session.nodes[fromNodeId].metadata.branchReason = options.reason;
    }

    session.updatedAt = nowISO();
    return fromNodeId;
  }

  /**
   * 回退到指定节点
   *
   * 将 currentNodeId 设为目标节点，后续消息从该节点继续追加。
   * 原路径保留（原 currentNodeId 的子节点仍在），可通过 jump 恢复。
   *
   * @param session - 当前 Session
   * @param nodeId - 回退目标节点 ID
   */
  rollback(session: Session, nodeId: string): void {
    if (!session.nodes[nodeId]) {
      throw new Error(`回退目标节点不存在: ${nodeId}`);
    }

    session.currentNodeId = nodeId;
    session.updatedAt = nowISO();
  }

  /**
   * 跳转到指定分支
   *
   * 将 currentNodeId 设为目标节点（通常是某分支的叶节点）
   *
   * @param session - 当前 Session
   * @param nodeId - 跳转目标节点 ID
   */
  jump(session: Session, nodeId: string): void {
    if (!session.nodes[nodeId]) {
      throw new Error(`跳转目标节点不存在: ${nodeId}`);
    }

    session.currentNodeId = nodeId;
    session.updatedAt = nowISO();
  }

  /**
   * 生成分支摘要
   *
   * 用 LLM 总结从 root 到指定节点的路径内容，
   * 将摘要节点添加到当前节点之后。
   *
   * @param session - 当前 Session
   * @param branchNodeId - 要摘要的分支叶节点 ID
   * @param targetNodeId - 摘要添加到的目标节点（默认 currentNodeId）
   * @param provider - LLM Provider（默认使用构造函数注入的 provider）
   * @returns 摘要节点 ID
   */
  async summarize(
    session: Session,
    branchNodeId: string,
    targetNodeId?: string,
    provider?: LLMProvider,
  ): Promise<string> {
    const llmProvider = provider ?? this.provider;
    if (!llmProvider) {
      throw new Error(
        'summarize 需要 LLMProvider，请通过构造函数或参数传入',
      );
    }

    if (!session.nodes[branchNodeId]) {
      throw new Error(`摘要目标节点不存在: ${branchNodeId}`);
    }

    // 1. 获取从 root 到 branchNodeId 的路径
    const pathNodes = TreeUtils.getPath(
      session.nodes,
      session.rootId,
      branchNodeId,
    );

    // 2. 转换为消息并拼接为摘要 prompt
    const messages = pathNodes
      .map((n) => TreeUtils.nodeToMessage(n))
      .filter(Boolean) as Message[];

    const conversationText = messages
      .map((m) => {
        const content =
          typeof m.content === 'string'
            ? m.content
            : JSON.stringify(m.content);
        return `${m.role}: ${content}`;
      })
      .join('\n\n');

    const summaryPrompt = `请将以下对话总结为 200-500 字的摘要，保留关键信息和决策要点：\n\n${conversationText}`;

    // 3. 调用 LLM 生成摘要
    const options: LLMOptions = {
      model: session.model,
      systemPrompt: '你是一个科研对话摘要助手。请将对话内容总结为简洁的摘要。',
      temperature: 0.3,
      maxTokens: 1024,
    };

    let summaryText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = llmProvider.complete(
        [{ role: 'user', content: summaryPrompt }],
        options,
      );

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          summaryText += event.content;
        } else if (event.type === 'message_end') {
          inputTokens = event.usage.inputTokens;
          outputTokens = event.usage.outputTokens;
        }
      }

      // 摘要调用的 token 用量累加到 session
      this.updateUsage(session, inputTokens, outputTokens, 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // LLM 调用失败时，摘要内容为错误信息
      summaryText = `[摘要生成失败: ${message}]`;
    }

    // 4. 如果指定了目标节点，先跳转到目标节点
    if (targetNodeId && session.nodes[targetNodeId]) {
      session.currentNodeId = targetNodeId;
    }

    // 5. 创建 summary 节点并添加到当前节点之后
    const summaryNodeId = this.addNode(session, {
      type: 'summary' as NodeType,
      content: summaryText,
      metadata: {
        summaryText,
        sourceBranchLeafId: branchNodeId,
        tokensUsed: { inputTokens, outputTokens },
      } as NodeMetadata,
    });

    return summaryNodeId;
  }

  /**
   * 获取从 root 到指定节点的路径
   * @returns 路径上的节点数组（从 root 到目标节点）
   */
  getPath(session: Session, nodeId: string): SessionNode[] {
    return TreeUtils.getPath(session.nodes, session.rootId, nodeId);
  }

  /**
   * 获取整个树结构（用于 /tree 命令可视化）
   * @returns 树的根节点及所有分支
   */
  getTree(session: Session): TreeStructure {
    const root = session.nodes[session.rootId];
    const branchInfos = TreeUtils.findBranches(session.nodes, session.rootId);
    const branches = branchInfos.map((b) =>
      TreeUtils.getPath(session.nodes, session.rootId, b.leafNode.id),
    );

    return { root, branches };
  }

  /**
   * 列出所有分支（叶节点）
   * @returns 分支叶节点列表，每个包含叶节点和路径长度
   */
  listBranches(session: Session): BranchInfo[] {
    return TreeUtils.findBranches(session.nodes, session.rootId);
  }

  /**
   * 获取当前路径上的消息数组（供 ContextBuilder 使用）
   * @returns 从 root 到 currentNodeId 的 Message[]
   */
  getCurrentPathMessages(session: Session): Message[] {
    if (!session.currentNodeId || !session.rootId) {
      return [];
    }

    const pathNodes = TreeUtils.getPath(
      session.nodes,
      session.rootId,
      session.currentNodeId,
    );

    return pathNodes
      .map((n) => TreeUtils.nodeToMessage(n))
      .filter(Boolean) as Message[];
  }

  /**
   * Phase 1 线性 Session 迁移到树形
   * 将 messages[] 转换为 root → 线性链 → leaf
   * @internal
   */
  migrateFromV1(session: Session & { messages: Message[] }): Session {
    const result = TreeUtils.messagesToNodes(session.messages);

    const migrated: Session = {
      id: session.id,
      nodes: result.nodes,
      rootId: result.rootId,
      currentNodeId: result.leafId,
      model: session.model,
      provider: session.provider,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      totalCost: session.totalCost,
      version: 2,
    };

    return migrated;
  }
}
