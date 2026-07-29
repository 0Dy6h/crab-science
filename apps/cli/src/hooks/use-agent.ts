import { useState, useCallback, useRef, useEffect } from 'react';
import * as path from 'path';
import type {
  Session,
  SessionNode,
  TokenUsage,
  AppConfig,
  LoadedExtension,
  SkillExecutionRecord,
  EvolutionEvent,
  Experience,
  SkillEvaluationResult,
  PatternMatch,
  SubagentMetrics,
  ChangeEntry,
  SubagentFrontmatter,
  GitLogEntry,
  OptimizationSuggestion,
} from '@crab-science/shared';
import {
  Agent,
  ToolRegistry,
  SessionManager,
  SkillLoader,
  ContextBuilder,
  ConfigManager,
  ExtensionLoader,
  TreeUtils,
  SubagentLoader,
  SubagentRegistry,
} from '@crab-science/agent-core';
import type { BranchInfo, TreeStructure } from '@crab-science/agent-core';
import { createProvider, ProviderRegistry } from '@crab-science/llm-layer';
import { EvolutionEngine } from '@crab-science/evolution-engine';
import { SubagentDelegator } from '@crab-science/evolution-engine';
import { CrabDatabase, GitManager, SkillMetricsRepository } from '@crab-science/storage';
import {
  GLOBAL_EXTENSIONS_DIR,
  PROJECT_EXTENSIONS_DIR,
  SUBAGENTS_DIR,
  expandTilde,
} from '@crab-science/shared';

/** 显示消息类型（CLI 渲染用） */
export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'summary';
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: { success: boolean; output: string; error?: string };
  isStreaming?: boolean;
  /** 是否为系统消息（命令输出等） */
  isSystem?: boolean;
}

/** useAgent Hook 返回值（Phase 2 增强） */
export interface UseAgentReturn {
  messages: DisplayMessage[];
  isProcessing: boolean;
  currentModel: string;
  currentProvider: string;
  tokenUsage: { inputTokens: number; outputTokens: number; cost: number };
  skills: { name: string; description: string }[];
  extensions: LoadedExtension[];
  sendMessage: (text: string) => Promise<void>;
  switchModel: (model: string) => void;
  switchProvider: (provider: string) => void;
  clearSession: () => void;
  loadSession: (id: string) => boolean;
  sessionList: { id: string; createdAt: string; model: string; nodeCount: number; version: number }[];
  refreshSessionList: () => void;
  config: AppConfig | null;
  // Phase 2: Tree operations
  forkSession: (reason?: string) => string | null;
  rollbackSession: (nodeId: string) => boolean;
  jumpToBranch: (nodeId: string) => boolean;
  summarizeBranch: (branchNodeId?: string) => Promise<string | null>;
  getTree: () => TreeStructure | null;
  getNodes: () => Record<string, SessionNode>;
  listBranches: () => BranchInfo[];
  getCurrentNodeId: () => string;
  refreshExtensions: () => void;
  getSkillHistory: (skillName: string, limit?: number) => SkillExecutionRecord[];
  refreshDisplay: () => void;
  // Phase 3: Evolution
  evolutionEvents: EvolutionEvent[];
  subagents: SubagentFrontmatter[];
  triggerEvolution: () => Promise<void>;
  getEvaluations: () => SkillEvaluationResult[];
  getDetectedPatterns: () => PatternMatch[];
  getRecentExperiences: (limit?: number) => Experience[];
  getChangelog: () => ChangeEntry[];
  getSkillVersionHistory: (skillName: string) => Promise<GitLogEntry[]>;
  getSubagentMetrics: (name: string) => SubagentMetrics | null;
  submitRating: (skillName: string, rating: number) => void;
  // Slice 3: HITL 确认循环
  getPendingOptimizations: () => OptimizationSuggestion[];
  previewOptimization: (suggestionId: string) => string | null;
  approveOptimization: (suggestionId: string) => Promise<{ newVersion: number; commitHash: string } | null>;
  rejectOptimization: (suggestionId: string) => boolean;
}

/**
 * Agent 交互 Hook（Phase 2 树形 Session + Extensions）
 *
 * 连接 agent-core 与 CLI 组件，管理：
 * - 树形 Session 的创建、加载、节点追加
 * - Extension 加载与热重载
 * - 分支操作（fork / rollback / jump / summarize）
 * - 消息显示（从当前路径提取 DisplayMessage）
 */
export function useAgent(workDir: string): UseAgentReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0, cost: 0 });
  const [sessionList, setSessionList] = useState<UseAgentReturn['sessionList']>([]);
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([]);
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [evolutionEvents, setEvolutionEvents] = useState<EvolutionEvent[]>([]);
  const [subagents, setSubagents] = useState<SubagentFrontmatter[]>([]);

  // 使用 ref 保存可变对象（不触发重渲染）
  const configManagerRef = useRef<ConfigManager | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const providerRegistryRef = useRef<ProviderRegistry | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const skillLoaderRef = useRef<SkillLoader | null>(null);
  const extensionLoaderRef = useRef<ExtensionLoader | null>(null);
  const toolRegistryRef = useRef<ToolRegistry | null>(null);
  const messageIdCounter = useRef(0);

  // Phase 3: Evolution refs
  const databaseRef = useRef<CrabDatabase | null>(null);
  const gitManagerRef = useRef<GitManager | null>(null);
  const evolutionEngineRef = useRef<EvolutionEngine | null>(null);
  const subagentRegistryRef = useRef<SubagentRegistry | null>(null);

  const currentModelRef = useRef('');
  const currentProviderRef = useRef('');
  const pendingToolMsgIdRef = useRef<string | null>(null);
  const [currentModel, setCurrentModel] = useState('');
  const [currentProvider, setCurrentProvider] = useState('');

  // ============================================================
  // Session Tree → DisplayMessage 转换
  // ============================================================

  /**
   * 从当前 Session 的 root → currentNodeId 路径提取 DisplayMessage[]
   * 用于在 CLI 中渲染当前分支的对话
   */
  const extractDisplayMessages = useCallback((session: Session): DisplayMessage[] => {
    if (!session.rootId || !session.currentNodeId) {
      return [];
    }

    const pathNodes = TreeUtils.getPath(
      session.nodes,
      session.rootId,
      session.currentNodeId,
    );

    const displayMsgs: DisplayMessage[] = [];
    for (let i = 0; i < pathNodes.length; i++) {
      const node = pathNodes[i];
      const msgId = `node_${i}`;

      switch (node.type) {
        case 'user': {
          const content =
            typeof node.content === 'string' ? node.content : '';
          displayMsgs.push({
            id: msgId,
            role: 'user',
            content,
          });
          break;
        }
        case 'assistant': {
          const content =
            typeof node.content === 'string'
              ? node.content
              : Array.isArray(node.content)
                ? node.content
                    .filter((b) => b.type === 'text')
                    .map((b) => b.text || '')
                    .join('')
                : '';
          displayMsgs.push({
            id: msgId,
            role: 'assistant',
            content,
          });
          break;
        }
        case 'tool_call': {
          displayMsgs.push({
            id: msgId,
            role: 'tool',
            content: '',
            toolName: node.metadata.toolName,
            toolParams: node.metadata.toolParams,
          });
          break;
        }
        case 'tool_result': {
          // 更新上一个 tool_call 消息的结果
          const lastToolMsg = displayMsgs[displayMsgs.length - 1];
          if (lastToolMsg && lastToolMsg.role === 'tool') {
            lastToolMsg.toolResult = {
              success: !node.metadata.isError,
              output:
                typeof node.content === 'string'
                  ? node.content
                  : node.metadata.toolResult || '',
              error: node.metadata.isError
                ? node.metadata.toolResult
                : undefined,
            };
            lastToolMsg.content = lastToolMsg.toolResult.output;
          }
          break;
        }
        case 'summary': {
          const content =
            node.metadata.summaryText ||
            (typeof node.content === 'string' ? node.content : '');
          displayMsgs.push({
            id: msgId,
            role: 'summary',
            content,
          });
          break;
        }
      }
    }

    return displayMsgs;
  }, []);

  /** 刷新显示消息（从当前 session 路径提取） */
  const refreshDisplay = useCallback(() => {
    if (sessionRef.current) {
      setMessages(extractDisplayMessages(sessionRef.current));
    }
  }, [extractDisplayMessages]);

  // ============================================================
  // 初始化
  // ============================================================

  useEffect(() => {
    let extensionLoader: ExtensionLoader | null = null;

    try {
      // 1. 加载配置
      const configManager = new ConfigManager();
      configManager.ensureConfigDir();
      const config = configManager.load();
      config.workDir = workDir;
      configManagerRef.current = configManager;
      configRef.current = config;

      // 2. 获取 API Key
      const apiKey = configManager.getApiKey(config.defaultProvider);

      // 3. 初始化 Provider
      const provider = createProvider(config.defaultProvider, apiKey);
      const registry = new ProviderRegistry();
      registry.register(provider);
      providerRegistryRef.current = registry;

      // 4. 初始化 Session Manager（注入 Provider 用于 summarize）
      const sessionManager = new SessionManager(undefined, provider);
      sessionManagerRef.current = sessionManager;

      // 5. 创建 Session
      const session = sessionManager.create({
        model: config.defaultModel,
        provider: config.defaultProvider,
      });
      sessionRef.current = session;

      // 6. 初始化 Skill Loader
      const skillLoader = new SkillLoader(undefined, workDir);
      skillLoaderRef.current = skillLoader;
      const discoveredSkills = skillLoader.discover();
      setSkills(discoveredSkills);

      // 7. 初始化 Tool Registry
      const toolRegistry = new ToolRegistry();
      toolRegistryRef.current = toolRegistry;

      // 8. 初始化 Extension Loader（Phase 2 新增）
      const extensionsDirs = [
        path.join(workDir, PROJECT_EXTENSIONS_DIR),
        expandTilde(GLOBAL_EXTENSIONS_DIR),
      ];
      extensionLoader = new ExtensionLoader(extensionsDirs, toolRegistry);
      extensionLoaderRef.current = extensionLoader;

      // 异步加载所有 extensions
      extensionLoader.loadAll().then((loaded) => {
        setExtensions(loaded);
        // 启动文件监听（hot-reload）
        extensionLoader!.startWatching();
      }).catch((err) => {
        console.error('[useAgent] Extension 加载失败:', err);
      });

      // 9. 初始化 Agent（Phase 3: 注入 EvolutionEngine + SubagentRegistry）
      const contextBuilder = new ContextBuilder();

      // 先创建 Agent（不等待进化引擎初始化）
      const agent = new Agent(
        provider,
        toolRegistry,
        sessionManager,
        skillLoader,
        contextBuilder,
        config,
      );
      agentRef.current = agent;

      // Phase 3: 异步初始化 CrabDatabase + GitManager + EvolutionEngine
      // 使用 async IIFE 避免阻塞 useEffect
      (async () => {
        try {
          const database = new CrabDatabase();
          database.initialize();
          databaseRef.current = database;

          // P-01 修复：把 SkillLoader 的执行记录读/写统一到 SQLite，
          // 否则 loader 读空 JSONL、EvolutionEngine 写 SQLite，两个存储长期分叉。
          const skillMetricsRepo = new SkillMetricsRepository(database);
          skillLoader.setSkillMetricsRepo(skillMetricsRepo);
          setSkills(skillLoader.discover());

          const gitManager = new GitManager();
          await gitManager.initialize();
          gitManagerRef.current = gitManager;

          // 解析进化分析的 Provider 与模型。
          // 关键：当进化 Provider 回退到主 Provider 时，模型也必须回退到主模型，
          // 否则会把 deepseek 的模型名发给 Anthropic，导致 400。
          let evolutionProvider = provider;
          let evolutionModel = config.defaultModel;
          const evolutionModelName = configManagerRef.current!.getEvolutionModel();
          const evolutionProviderName = configManagerRef.current!.getEvolutionProviderName();

          if (evolutionProviderName === config.defaultProvider) {
            // 同一 Provider：进化模型与主 Provider 兼容，直接使用
            evolutionModel = evolutionModelName;
          } else {
            try {
              const evolutionApiKey = configManagerRef.current!.getApiKey(evolutionProviderName);
              evolutionProvider = createProvider(evolutionProviderName, evolutionApiKey);
              evolutionModel = evolutionModelName;
              if (!providerRegistryRef.current!.has(evolutionProviderName)) {
                providerRegistryRef.current!.register(evolutionProvider);
              }
            } catch {
              console.warn('[useAgent] 进化 Provider API Key 未设置，回退到主 Provider 与主模型');
            }
          }

          // 创建 SubagentDelegator（使用用户选定的 workDir，而非 process.cwd()）
          const subagentDelegator = new SubagentDelegator(
            sessionManager,
            providerRegistryRef.current!,
            toolRegistry,
            skillLoader,
            contextBuilder,
            workDir,
          );

          // 创建 EvolutionEngine
          const evolutionEngine = new EvolutionEngine({
            database,
            gitManager,
            evolutionProvider,
            evolutionModel,
            config: config.evolutionConfig ?? {},
            workDir,
            subagentDelegator,
          });
          evolutionEngineRef.current = evolutionEngine;

          // 注册事件回调
          evolutionEngine.onEvent((event: EvolutionEvent) => {
            setEvolutionEvents((prev) => {
              const updated = [event, ...prev];
              return updated.slice(0, 20);
            });

            if (event.type === 'optimization_proposed') {
              const s = event.suggestion;
              console.log(
                `\n⚡ 新的优化建议待确认: ${s.skillName} v${s.currentVersion}→v${s.currentVersion + 1} [${s.severity}]\n` +
                `   ${s.suggestion}\n` +
                `   输入 /pending 查看详情，/approve ${s.id} 确认，/reject ${s.id} 拒绝\n`,
              );
            }

            if (event.type === 'subagent_created') {
              if (subagentRegistryRef.current) {
                subagentRegistryRef.current.refresh();
                setSubagents(subagentRegistryRef.current.list());
              }
            }
          });

          // 创建 SubagentLoader + SubagentRegistry
          const subagentLoader = new SubagentLoader(expandTilde(SUBAGENTS_DIR));
          const subagentRegistry = new SubagentRegistry(subagentLoader);
          subagentRegistry.init();
          subagentRegistryRef.current = subagentRegistry;
          setSubagents(subagentRegistry.list());

          // 延迟注入到 Agent
          agent.setEvolutionEngine(evolutionEngine);
          agent.setSubagentRegistry(subagentRegistry);
        } catch (err) {
          console.error('[useAgent] 进化引擎初始化失败（非致命）:', err);
        }
      })();
      agentRef.current = agent;

      currentModelRef.current = config.defaultModel;
      currentProviderRef.current = config.defaultProvider;
      setCurrentModel(config.defaultModel);
      setCurrentProvider(config.defaultProvider);

      // 10. 加载 session 列表
      setSessionList(sessionManager.list());

      // 11. SIGINT 处理
      const handleSigInt = () => {
        if (sessionRef.current) {
          sessionManager.save(sessionRef.current);
        }
        if (extensionLoader) {
          extensionLoader.stopWatching();
        }
        if (databaseRef.current) {
          databaseRef.current.close();
        }
        process.exit(0);
      };
      process.on('SIGINT', handleSigInt);

      return () => {
        process.off('SIGINT', handleSigInt);
        if (extensionLoader) {
          extensionLoader.stopWatching();
        }
        if (databaseRef.current) {
          databaseRef.current.close();
        }
      };
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  }, [workDir]);

  /** 生成消息 ID */
  const nextMessageId = (): string => {
    messageIdCounter.current += 1;
    return `msg_${messageIdCounter.current}`;
  };

  // ============================================================
  // 消息发送（树形 Session）
  // ============================================================

  /** 发送消息 */
  const sendMessage = useCallback(async (text: string) => {
    if (!agentRef.current || !sessionRef.current || isProcessing) return;

    setIsProcessing(true);

    try {
      const stream = agentRef.current.run(sessionRef.current, text);

      // 流式处理：边接收边更新显示
      for await (const event of stream) {
        switch (event.type) {
          case 'text': {
            // 流式追加文本 — 从 session 路径重建显示
            refreshDisplay();
            break;
          }
          case 'tool_call': {
            refreshDisplay();
            break;
          }
          case 'tool_result': {
            refreshDisplay();
            break;
          }
          case 'error': {
            // F1 修复：把 Agent/Provider 的错误明确呈现给用户，而不是静默吞掉
            refreshDisplay();
            setMessages((prev) => [
              ...prev,
              {
                id: nextMessageId(),
                role: 'assistant',
                content: `[错误] ${event.message}`,
                isSystem: true,
              },
            ]);
            break;
          }
          case 'done': {
            // 最终刷新显示 + 更新 token 统计
            refreshDisplay();
            setTokenUsage((prev) => ({
              inputTokens: prev.inputTokens + event.usage.inputTokens,
              outputTokens: prev.outputTokens + event.usage.outputTokens,
              cost: prev.cost + event.usage.cost,
            }));
            break;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      refreshDisplay();
      // 追加错误消息
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: `[错误] ${message}`,
          isSystem: true,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, refreshDisplay]);

  // ============================================================
  // 模型 / Provider 切换
  // ============================================================

  /** 切换模型 */
  const switchModel = useCallback((model: string) => {
    if (!sessionRef.current) return;
    sessionRef.current.model = model;
    currentModelRef.current = model;
    setCurrentModel(model);
  }, []);

  /** 切换 Provider */
  const switchProvider = useCallback((provider: string) => {
    if (!sessionRef.current || !configManagerRef.current || !configRef.current) return;

    try {
      const apiKey = configManagerRef.current.getApiKey(provider);
      const newProvider = createProvider(provider, apiKey);
      const registry = new ProviderRegistry();
      registry.register(newProvider);
      providerRegistryRef.current = registry;

      // 重建 agent（复用 toolRegistry 和 extensionLoader）
      const toolRegistry = toolRegistryRef.current ?? new ToolRegistry();
      toolRegistryRef.current = toolRegistry;
      const sessionManager = sessionManagerRef.current!;
      const skillLoader = skillLoaderRef.current!;
      const contextBuilder = new ContextBuilder();
      const config = { ...configRef.current, defaultProvider: provider as 'openai' | 'anthropic' };
      configRef.current = config;

      const agent = new Agent(
        newProvider,
        toolRegistry,
        sessionManager,
        skillLoader,
        contextBuilder,
        config,
        evolutionEngineRef.current ?? undefined,
        subagentRegistryRef.current ?? undefined,
      );
      agentRef.current = agent;

      sessionRef.current.provider = provider;
      currentProviderRef.current = provider;
      setCurrentProvider(provider);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // ============================================================
  // Session 管理（树形）
  // ============================================================

  /** 新建 Session */
  const clearSession = useCallback(() => {
    if (!sessionManagerRef.current || !configRef.current) return;
    const session = sessionManagerRef.current.create({
      model: currentModelRef.current || configRef.current.defaultModel,
      provider: currentProviderRef.current || configRef.current.defaultProvider,
    });
    sessionRef.current = session;
    setMessages([]);
    setTokenUsage({ inputTokens: 0, outputTokens: 0, cost: 0 });
    setSessionList(sessionManagerRef.current.list());
  }, []);

  /** 加载历史 Session */
  const loadSession = useCallback((id: string): boolean => {
    if (!sessionManagerRef.current) return false;
    const session = sessionManagerRef.current.load(id);
    if (!session) return false;
    sessionRef.current = session;

    // 从树形路径提取显示消息
    setMessages(extractDisplayMessages(session));
    setCurrentModel(session.model);
    setCurrentProvider(session.provider);
    currentModelRef.current = session.model;
    currentProviderRef.current = session.provider;
    return true;
  }, [extractDisplayMessages]);

  /** 刷新 Session 列表 */
  const refreshSessionList = useCallback(() => {
    if (!sessionManagerRef.current) return;
    setSessionList(sessionManagerRef.current.list());
  }, []);

  // ============================================================
  // Phase 2: 树形操作
  // ============================================================

  /** Fork 分支 */
  const forkSession = useCallback((reason?: string): string | null => {
    if (!sessionManagerRef.current || !sessionRef.current) return null;
    try {
      const forkNodeId = sessionManagerRef.current.fork(sessionRef.current, {
        reason,
      });
      sessionManagerRef.current.save(sessionRef.current);
      return forkNodeId;
    } catch (err) {
      console.error('Fork 失败:', err);
      return null;
    }
  }, []);

  /** 回退到指定节点 */
  const rollbackSession = useCallback((nodeId: string): boolean => {
    if (!sessionManagerRef.current || !sessionRef.current) return false;
    try {
      sessionManagerRef.current.rollback(sessionRef.current, nodeId);
      sessionManagerRef.current.save(sessionRef.current);
      refreshDisplay();
      return true;
    } catch (err) {
      console.error('Rollback 失败:', err);
      return false;
    }
  }, [refreshDisplay]);

  /** 跳转到指定分支 */
  const jumpToBranch = useCallback((nodeId: string): boolean => {
    if (!sessionManagerRef.current || !sessionRef.current) return false;
    try {
      sessionManagerRef.current.jump(sessionRef.current, nodeId);
      sessionManagerRef.current.save(sessionRef.current);
      refreshDisplay();
      return true;
    } catch (err) {
      console.error('Jump 失败:', err);
      return false;
    }
  }, [refreshDisplay]);

  /** 生成分支摘要 */
  const summarizeBranch = useCallback(async (branchNodeId?: string): Promise<string | null> => {
    if (!sessionManagerRef.current || !sessionRef.current) return null;
    try {
      const targetNodeId = branchNodeId ?? sessionRef.current.currentNodeId;
      const summaryNodeId = await sessionManagerRef.current.summarize(
        sessionRef.current,
        targetNodeId,
      );
      sessionManagerRef.current.save(sessionRef.current);
      refreshDisplay();
      return summaryNodeId;
    } catch (err) {
      console.error('Summarize 失败:', err);
      return null;
    }
  }, [refreshDisplay]);

  /** 获取树结构 */
  const getTree = useCallback((): TreeStructure | null => {
    if (!sessionManagerRef.current || !sessionRef.current) return null;
    if (!sessionRef.current.rootId) return null;
    return sessionManagerRef.current.getTree(sessionRef.current);
  }, []);

  /** 获取所有节点 Map（供 TreeView 使用） */
  const getNodes = useCallback((): Record<string, SessionNode> => {
    return sessionRef.current?.nodes ?? {};
  }, []);

  /** 列出所有分支 */
  const listBranches = useCallback((): BranchInfo[] => {
    if (!sessionManagerRef.current || !sessionRef.current) return [];
    if (!sessionRef.current.rootId) return [];
    return sessionManagerRef.current.listBranches(sessionRef.current);
  }, []);

  /** 获取当前节点 ID */
  const getCurrentNodeId = useCallback((): string => {
    return sessionRef.current?.currentNodeId ?? '';
  }, []);

  // ============================================================
  // Phase 2: Extensions
  // ============================================================

  /** 刷新 extensions 列表 */
  const refreshExtensions = useCallback(() => {
    if (!extensionLoaderRef.current) return;
    setExtensions(extensionLoaderRef.current.listLoaded());
  }, []);

  // ============================================================
  // Phase 2: Skill 执行历史
  // ============================================================

  /** 获取 Skill 执行历史 */
  const getSkillHistory = useCallback((skillName: string, limit = 10): SkillExecutionRecord[] => {
    if (!skillLoaderRef.current) return [];
    return skillLoaderRef.current.getExecutionHistory(skillName, { limit });
  }, []);

  // ============================================================
  // Phase 3: Evolution 相关方法
  // ============================================================

  /** 手动触发进化评估 */
  const triggerEvolution = useCallback(async (): Promise<void> => {
    if (!evolutionEngineRef.current) return;
    await evolutionEngineRef.current.runFullEvaluation();
  }, []);

  /** 获取所有 Skill 评估结果 */
  const getEvaluations = useCallback((): SkillEvaluationResult[] => {
    if (!evolutionEngineRef.current) return [];
    return evolutionEngineRef.current.getAllEvaluations();
  }, []);

  /** 获取检测到的模式 */
  const getDetectedPatterns = useCallback((): PatternMatch[] => {
    if (!evolutionEngineRef.current) return [];
    return evolutionEngineRef.current.getDetectedPatterns();
  }, []);

  /** 获取最近经验 */
  const getRecentExperiences = useCallback((limit = 10): Experience[] => {
    if (!evolutionEngineRef.current) return [];
    return evolutionEngineRef.current.getRecentExperiences(limit);
  }, []);

  /** 获取变更日志 */
  const getChangelog = useCallback((): ChangeEntry[] => {
    if (!evolutionEngineRef.current) return [];
    return evolutionEngineRef.current.getChangelog();
  }, []);

  /** 获取 Git-backed Skill 版本历史 */
  const getSkillVersionHistory = useCallback(async (skillName: string): Promise<GitLogEntry[]> => {
    if (!evolutionEngineRef.current) return [];
    try {
      return await evolutionEngineRef.current.getSkillVersionHistory(skillName);
    } catch {
      return [];
    }
  }, []);

  /** 获取 Subagent 指标 */
  const getSubagentMetrics = useCallback((name: string): SubagentMetrics | null => {
    if (!evolutionEngineRef.current) return null;
    try {
      return evolutionEngineRef.current.getSubagentMetrics(name);
    } catch {
      return null;
    }
  }, []);

  /** 提交用户评分 */
  const submitRating = useCallback((skillName: string, rating: number): void => {
    if (!evolutionEngineRef.current) return;
    evolutionEngineRef.current.submitRating(skillName, rating);
  }, []);

  // ============================================================
  // Slice 3: HITL 确认循环
  // ============================================================

  /** 获取待确认的 major 优化建议 */
  const getPendingOptimizations = useCallback((): OptimizationSuggestion[] => {
    if (!evolutionEngineRef.current) return [];
    return evolutionEngineRef.current.getPendingOptimizations();
  }, []);

  /** 预览优化建议变更 */
  const previewOptimization = useCallback((suggestionId: string): string | null => {
    if (!evolutionEngineRef.current) return null;
    return evolutionEngineRef.current.previewOptimization(suggestionId);
  }, []);

  /** 确认并应用优化建议 */
  const approveOptimization = useCallback(
    async (suggestionId: string): Promise<{ newVersion: number; commitHash: string } | null> => {
      if (!evolutionEngineRef.current) return null;
      try {
        return await evolutionEngineRef.current.approveOptimization(suggestionId);
      } catch (err) {
        console.error('[useAgent] 应用优化失败:', err);
        return null;
      }
    },
    [],
  );

  /** 拒绝优化建议 */
  const rejectOptimization = useCallback((suggestionId: string): boolean => {
    if (!evolutionEngineRef.current) return false;
    return evolutionEngineRef.current.rejectOptimization(suggestionId);
  }, []);

  return {
    messages,
    isProcessing,
    currentModel,
    currentProvider,
    tokenUsage,
    skills,
    extensions,
    sendMessage,
    switchModel,
    switchProvider,
    clearSession,
    loadSession,
    sessionList,
    refreshSessionList,
    config: configRef.current,
    // Phase 2
    forkSession,
    rollbackSession,
    jumpToBranch,
    summarizeBranch,
    getTree,
    getNodes,
    listBranches,
    getCurrentNodeId,
    refreshExtensions,
    getSkillHistory,
    refreshDisplay,
    // Phase 3
    evolutionEvents,
    subagents,
    triggerEvolution,
    getEvaluations,
    getDetectedPatterns,
    getRecentExperiences,
    getChangelog,
    getSkillVersionHistory,
    getSubagentMetrics,
    submitRating,
    // Slice 3: HITL
    getPendingOptimizations,
    previewOptimization,
    approveOptimization,
    rejectOptimization,
  };
}
