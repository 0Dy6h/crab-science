import type { UseAgentReturn } from '../hooks/use-agent.js';

/** 命令处理结果 */
export interface CommandResult {
  handled: boolean;
  output?: string;
  exit?: boolean;
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

/**
 * 斜杠命令处理器
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
        return { handled: true, output: '已创建新的 Session。' };

      case 'skills':
        return this.handleSkills();

      case 'session':
        return this.handleSession(args);

      case 'config':
        return this.handleConfig();

      case 'help':
        return this.handleHelp();

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

    // 检查是否需要切换 provider
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
    const lines = skills.map((s) => `  - ${s.name}: ${s.description}`);
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
        (s) => `  ${s.id} | ${s.createdAt} | ${s.model} | ${s.messageCount} 条消息`,
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
        return { handled: true, output: `已加载 Session: ${id}` };
      }
      return { handled: true, output: `Session ${id} 不存在或已损坏。` };
    }

    return { handled: true, output: `用法: /session list | /session load <id>` };
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
      ].join('\n'),
    };
  }

  /** /help */
  private handleHelp(): CommandResult {
    return {
      handled: true,
      output: [
        '可用命令:',
        '  /model [name]     切换模型（不传参列出可用模型）',
        '  /provider [name]  切换 Provider (openai/anthropic)',
        '  /clear            新建 Session',
        '  /skills           列出已安装 Skills',
        '  /session list     列出历史 Session',
        '  /session load <id> 加载历史 Session',
        '  /config           查看当前配置',
        '  /help             显示帮助',
        '  /exit             退出',
      ].join('\n'),
    };
  }
}
