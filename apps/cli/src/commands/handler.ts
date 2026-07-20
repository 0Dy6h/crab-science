import type { UseAgentReturn } from '../hooks/use-agent.js';
import type { SessionNode } from '@crab-science/shared';

/** 命令处理结果 */
export interface CommandResult {
  handled: boolean;
  output?: string;
  exit?: boolean;
  /** 是否需要刷新树视图 */
  refreshTree?: boolean;
}

/** 可用模型列表 */
const AVAILABLE_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
};

/** 节点类型中文标签 */
const NODE_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  assistant: '助手',
  tool_call: '工具调用',
  tool_result: '工具结果',
  summary: '摘要',
};

/** 节点类型图标 */
const NODE_TYPE_ICONS: Record<string, string> = {
  user: '👤',
  assistant: '🤖',
  tool_call: '🔧',
  tool_result: '📋',
  summary: '📝',
};

/**
 * 斜杠命令处理器（Phase 2 增强）
 *
 * 新增命令：
 * - /tree          查看当前 Session 树结构
 * - /branch [reason]  Fork 新分支
 * - /rollback <nodeId>  回退到指定节点
 * - /jump <nodeId>  跳转到指定分支
 * - /summarize [nodeId]  生成当前分支摘要
 * - /extensions    列出已加载的 Extensions
 * - /skill-history <name>  查看 Skill 执行历史
 */
export class CommandHandler {
  private agent: UseAgentReturn;

  constructor(agent: UseAgentReturn) {
    this.agent = agent;
  }

  /**
   * 处理用户输入
   * @returns CommandResult
   */
  handle(input: string): CommandResult {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return { handled: false };
    }

    const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
    const arg = args.join(' ');

    switch (cmd.toLowerCase()) {
      case 'model':
        return this.handleModel(arg);

      case 'provider':
        return this.handleProvider(arg);

      case 'clear':
        this.agent.clearSession();
        return { handled: true, output: '已创建新的 Session。', refreshTree: true };

      case 'skills':
        return this.handleSkills();

      case 'session':
        return this.handleSession(args);

      case 'config':
        return this.handleConfig();

      case 'help':
        return this.handleHelp();

      // Phase 2 新增命令
      case 'tree':
        return this.handleTree();

      case 'branch':
        return this.handleBranch(arg);

      case 'rollback':
        return this.handleRollback(args[0]);

      case 'jump':
        return this.handleJump(args[0]);

      case 'summarize':
        return this.handleSummarize(args[0]);

      case 'extensions':
      case 'ext':
        return this.handleExtensions();

      case 'skill-history':
      case 'sh':
        return this.handleSkillHistory(args[0], args[1]);

      case 'exit':
      case 'quit':
        return { handled: true, exit: true };

      default:
        return {
          handled: true,
          output: `未知命令: /${cmd}。输入 /help 查看可用命令。`,
        };
    }
  }

  /** /model [name] */
  private handleModel(arg: string): CommandResult {
    if (!arg) {
      const provider = this.agent.currentProvider;
      const models = AVAILABLE_MODELS[provider] ?? [];
      return {
        handled: true,
        output: `当前 Provider: ${provider}\n可用模型:\n${models.map((m) => `  - ${m}`).join('\n')}\n当前模型: ${this.agent.currentModel}`,
      };
    }

    if (arg.startsWith('gpt')) {
      this.agent.switchProvider('openai');
    } else if (arg.startsWith('claude')) {
      this.agent.switchProvider('anthropic');
    }
    this.agent.switchModel(arg);
    return { handled: true, output: `已切换模型: ${arg}` };
  }

  /** /provider [name] */
  private handleProvider(arg: string): CommandResult {
    if (!arg) {
      return {
        handled: true,
        output: `当前 Provider: ${this.agent.currentProvider}\n可用: openai, anthropic`,
      };
    }
    if (!['openai', 'anthropic'].includes(arg.toLowerCase())) {
      return { handled: true, output: `未知 Provider: ${arg}。可用: openai, anthropic` };
    }
    this.agent.switchProvider(arg.toLowerCase());
    return { handled: true, output: `已切换 Provider: ${arg}` };
  }

  /** /skills */
  private handleSkills(): CommandResult {
    const skills = this.agent.skills;
    if (skills.length === 0) {
      return { handled: true, output: '未发现已安装的 Skills。' };
    }
    const lines = skills.map(
      (s) =>
        `  - ${s.name}: ${s.description}${('executionCount' in s && s.executionCount) ? ` (执行 ${s.executionCount} 次)` : ''}`,
    );
    return {
      handled: true,
      output: `已安装 Skills (${skills.length}):\n${lines.join('\n')}`,
    };
  }

  /** /session list | /session load [id] */
  private handleSession(args: string[]): CommandResult {
    const subCmd = args[0]?.toLowerCase();

    if (subCmd === 'list' || !subCmd) {
      const sessions = this.agent.sessionList;
      if (sessions.length === 0) {
        return { handled: true, output: '暂无历史 Session。' };
      }
      const lines = sessions.map(
        (s) => `  ${s.id} | ${s.createdAt} | ${s.model} | ${s.nodeCount} 节点 | v${s.version}`,
      );
      return {
        handled: true,
        output: `历史 Sessions (${sessions.length}):\n${lines.join('\n')}`,
      };
    }

    if (subCmd === 'load') {
      const id = args[1];
      if (!id) {
        return { handled: true, output: '用法: /session load <session-id>' };
      }
      const success = this.agent.loadSession(id);
      if (success) {
        return { handled: true, output: `已加载 Session: ${id}`, refreshTree: true };
      }
      return { handled: true, output: `Session ${id} 不存在或已损坏。` };
    }

    return { handled: true, output: '用法: /session list | /session load <id>' };
  }

  /** /config */
  private handleConfig(): CommandResult {
    const config = this.agent.config;
    if (!config) {
      return { handled: true, output: '配置未加载。' };
    }
    return {
      handled: true,
      output: [
        '当前配置:',
        `  Provider: ${this.agent.currentProvider}`,
        `  Model: ${this.agent.currentModel}`,
        `  Max Iterations: ${config.maxIterations}`,
        `  Bash Timeout: ${config.bashTimeoutMs}ms`,
        `  Work Dir: ${config.workDir}`,
        `  Token: ${this.agent.tokenUsage.inputTokens + this.agent.tokenUsage.outputTokens}`,
        `  Cost: $${this.agent.tokenUsage.cost.toFixed(4)}`,
        `  Extensions: ${this.agent.extensions.length} 个已加载`,
      ].join('\n'),
    };
  }

  // ============================================================
  // Phase 2 新增命令处理
  // ============================================================

  /** /tree — 查看当前 Session 树结构 */
  private handleTree(): CommandResult {
    const tree = this.agent.getTree();
    const branches = this.agent.listBranches();
    const currentNodeId = this.agent.getCurrentNodeId();

    if (!tree || !tree.root) {
      return { handled: true, output: '当前 Session 为空（无节点）。' };
    }

    const lines: string[] = ['Session 树结构:', ''];

    // 渲染树
    this.renderTreeNode(tree.root, '', true, lines, currentNodeId);

    lines.push('');
    lines.push(`分支总数: ${branches.length}`);
    lines.push(`当前节点: ${currentNodeId.substring(0, 12)}...`);

    // 列出所有分支
    if (branches.length > 0) {
      lines.push('');
      lines.push('分支列表:');
      branches.forEach((branch, i) => {
        const isCurrent = branch.leafNode.id === currentNodeId;
        const marker = isCurrent ? ' ← 当前' : '';
        const reason = branch.branchReason ? ` (${branch.branchReason})` : '';
        lines.push(
          `  [${i}] ${branch.leafNode.id.substring(0, 12)}... | 深度 ${branch.pathLength} | ${NODE_TYPE_LABELS[branch.leafNode.type] ?? branch.leafNode.type}${reason}${marker}`,
        );
      });
    }

    return { handled: true, output: lines.join('\n') };
  }

  /**
   * 递归渲染树节点
   * @internal
   */
  private renderTreeNode(
    node: SessionNode,
    prefix: string,
    isLast: boolean,
    lines: string[],
    currentNodeId: string,
  ): void {
    const connector = isLast ? '└── ' : '├── ';
    const icon = NODE_TYPE_ICONS[node.type] ?? '•';
    const isCurrent = node.id === currentNodeId;
    const marker = isCurrent ? ' ← 当前' : '';

    // 提取内容摘要
    let summary = '';
    if (typeof node.content === 'string') {
      summary = node.content.substring(0, 40).replace(/\n/g, ' ');
    }

    // 工具调用显示工具名
    if (node.type === 'tool_call' && node.metadata.toolName) {
      summary = String(node.metadata.toolName);
    }

    lines.push(`${prefix}${connector}${icon} ${NODE_TYPE_LABELS[node.type] ?? node.type} [${node.id.substring(0, 8)}] ${summary ? '- ' + summary : ''}${marker}`);

    // 递归子节点
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const childCount = node.childrenIds.length;

    // 注意：这里无法直接访问 session.nodes，所以简化处理
    // 实际树渲染在 tree-view.tsx 组件中完成
    if (childCount > 0) {
      lines.push(`${childPrefix}├── ... (${childCount} 个子节点)`);
    }
  }

  /** /branch [reason] — Fork 新分支 */
  private handleBranch(reason: string): CommandResult {
    const forkNodeId = this.agent.forkSession(reason || undefined);
    if (forkNodeId) {
      const msg = reason
        ? `已从节点 ${forkNodeId.substring(0, 12)}... 创建分支（原因: ${reason}）。后续消息将从该节点延伸新分支。`
        : `已从节点 ${forkNodeId.substring(0, 12)}... 创建分支。后续消息将从该节点延伸新分支。`;
      return { handled: true, output: msg, refreshTree: true };
    }
    return { handled: true, output: '分支创建失败。请确保当前 Session 有节点。' };
  }

  /** /rollback <nodeId> — 回退到指定节点 */
  private handleRollback(nodeId: string | undefined): CommandResult {
    if (!nodeId) {
      // 列出可用节点供选择
      const branches = this.agent.listBranches();
      if (branches.length === 0) {
        return { handled: true, output: '当前 Session 无可用节点。用法: /rollback <nodeId>' };
      }
      const lines = branches.map((b, i) => {
        const isCurrent = b.leafNode.id === this.agent.getCurrentNodeId();
        return `  [${i}] ${b.leafNode.id} | ${NODE_TYPE_LABELS[b.leafNode.type] ?? b.leafNode.type} | 深度 ${b.pathLength}${isCurrent ? ' ← 当前' : ''}`;
      });
      return {
        handled: true,
        output: `用法: /rollback <nodeId>\n可用叶节点:\n${lines.join('\n')}`,
      };
    }

    const success = this.agent.rollbackSession(nodeId);
    if (success) {
      return {
        handled: true,
        output: `已回退到节点 ${nodeId.substring(0, 12)}...。原路径已保留。`,
        refreshTree: true,
      };
    }
    return { handled: true, output: `回退失败：节点 ${nodeId} 不存在。` };
  }

  /** /jump <nodeId> — 跳转到指定分支 */
  private handleJump(nodeId: string | undefined): CommandResult {
    if (!nodeId) {
      const branches = this.agent.listBranches();
      if (branches.length === 0) {
        return { handled: true, output: '当前 Session 无可用分支。用法: /jump <nodeId>' };
      }
      const lines = branches.map((b, i) => {
        const isCurrent = b.leafNode.id === this.agent.getCurrentNodeId();
        const reason = b.branchReason ? ` (${b.branchReason})` : '';
        return `  [${i}] ${b.leafNode.id} | ${NODE_TYPE_LABELS[b.leafNode.type] ?? b.leafNode.type} | 深度 ${b.pathLength}${reason}${isCurrent ? ' ← 当前' : ''}`;
      });
      return {
        handled: true,
        output: `用法: /jump <nodeId>\n可用分支叶节点:\n${lines.join('\n')}`,
      };
    }

    const success = this.agent.jumpToBranch(nodeId);
    if (success) {
      return {
        handled: true,
        output: `已跳转到分支 ${nodeId.substring(0, 12)}...`,
        refreshTree: true,
      };
    }
    return { handled: true, output: `跳转失败：节点 ${nodeId} 不存在。` };
  }

  /** /summarize [nodeId] — 生成分支摘要 */
  private handleSummarize(nodeId: string | undefined): CommandResult {
    const targetNodeId = nodeId ?? this.agent.getCurrentNodeId();

    if (!targetNodeId) {
      return { handled: true, output: '当前 Session 无节点可摘要。' };
    }

    // 异步执行摘要生成
    this.agent.summarizeBranch(targetNodeId).then((summaryId) => {
      if (summaryId) {
        console.log(`\n✓ 摘要已生成，节点 ID: ${summaryId.substring(0, 12)}...`);
      } else {
        console.log('\n✗ 摘要生成失败。');
      }
    });

    return {
      handled: true,
      output: `正在生成分支摘要（目标节点: ${targetNodeId.substring(0, 12)}...）...`,
      refreshTree: true,
    };
  }

  /** /extensions — 列出已加载的 Extensions */
  private handleExtensions(): CommandResult {
    const exts = this.agent.extensions;
    if (exts.length === 0) {
      return {
        handled: true,
        output: '未加载任何 Extension。\n提示: 在项目 extensions/ 目录或 ~/.crab-science/extensions/ 目录放置 .ts 文件。',
      };
    }

    const lines = exts.map((ext) => {
      const status = ext.status === 'loaded' ? '✓ 已加载' : `✗ 错误: ${ext.error ?? '未知'}`;
      const toolName = ext.module?.tool?.name ?? '无工具';
      return `  - ${ext.name} | ${status} | 工具: ${toolName} | 加载于 ${ext.loadedAt}`;
    });

    return {
      handled: true,
      output: `已加载 Extensions (${exts.length}):\n${lines.join('\n')}`,
    };
  }

  /** /skill-history <name> [limit] — 查看 Skill 执行历史 */
  private handleSkillHistory(skillName: string | undefined, limitArg: string | undefined): CommandResult {
    if (!skillName) {
      const skills = this.agent.skills;
      if (skills.length === 0) {
        return { handled: true, output: '未发现已安装的 Skills。' };
      }
      const lines = skills.map(
        (s) => `  - ${s.name}: ${s.description}`,
      );
      return {
        handled: true,
        output: `用法: /skill-history <skill-name> [limit]\n可用 Skills:\n${lines.join('\n')}`,
      };
    }

    const limit = limitArg ? parseInt(limitArg, 10) || 10 : 10;
    const history = this.agent.getSkillHistory(skillName, limit);

    if (history.length === 0) {
      return { handled: true, output: `Skill "${skillName}" 暂无执行记录。` };
    }

    const lines = history.map((record, i) => {
      const statusIcon =
        record.status === 'success' ? '✓' :
        record.status === 'failed' ? '✗' : '◐';
      const duration = (record.durationMs / 1000).toFixed(1);
      const steps = record.steps.length > 0
        ? `\n      步骤: ${record.steps.join(' → ')}`
        : '';
      const error = record.error ? `\n      错误: ${record.error}` : '';
      const tokens = record.tokenUsage
        ? ` | Token: ${record.tokenUsage.inputTokens}+${record.tokenUsage.outputTokens}`
        : '';
      return `  [${i}] ${statusIcon} ${record.timestamp} | ${duration}s | ${record.status}${tokens}${steps}${error}`;
    });

    return {
      handled: true,
      output: `Skill "${skillName}" 执行历史 (${history.length} 条):\n${lines.join('\n')}`,
    };
  }

  /** /help */
  private handleHelp(): CommandResult {
    return {
      handled: true,
      output: [
        '可用命令:',
        '',
        '  会话管理:',
        '  /model [name]      切换模型（不传参列出可用模型）',
        '  /provider [name]   切换 Provider (openai/anthropic)',
        '  /clear             新建 Session',
        '  /session list      列出历史 Session',
        '  /session load <id> 加载历史 Session',
        '',
        '  树形 Session (Phase 2):',
        '  /tree              查看当前 Session 树结构',
        '  /branch [reason]   Fork 新分支',
        '  /rollback [nodeId] 回退到指定节点',
        '  /jump [nodeId]     跳转到指定分支',
        '  /summarize [nodeId] 生成当前分支摘要',
        '',
        '  Skills & Extensions:',
        '  /skills            列出已安装 Skills',
        '  /skill-history <name> [n]  查看 Skill 执行历史',
        '  /extensions        列出已加载 Extensions',
        '',
        '  其他:',
        '  /config            查看当前配置',
        '  /help              显示帮助',
        '  /exit              退出',
      ].join('\n'),
    };
  }
}
