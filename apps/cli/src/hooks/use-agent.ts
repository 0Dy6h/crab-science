import { useState, useCallback, useRef, useEffect } from 'react';
import type { Session, TokenUsage, AppConfig } from '@crab-science/shared';
import {
  Agent,
  ToolRegistry,
  SessionManager,
  SkillLoader,
  ContextBuilder,
  ConfigManager,
} from '@crab-science/agent-core';
import { createProvider, ProviderRegistry } from '@crab-science/llm-layer';

/** 显示消息类型（CLI 渲染用） */
export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: { success: boolean; output: string; error?: string };
  isStreaming?: boolean;
}

/** useAgent Hook 返回值 */
export interface UseAgentReturn {
  messages: DisplayMessage[];
  isProcessing: boolean;
  currentModel: string;
  currentProvider: string;
  tokenUsage: { inputTokens: number; outputTokens: number; cost: number };
  skills: { name: string; description: string }[];
  sendMessage: (text: string) => Promise<void>;
  switchModel: (model: string) => void;
  switchProvider: (provider: string) => void;
  clearSession: () => void;
  loadSession: (id: string) => boolean;
  sessionList: { id: string; createdAt: string; model: string; messageCount: number }[];
  refreshSessionList: () => void;
  config: AppConfig | null;
}

/**
 * Agent 交互 Hook
 * 连接 agent-core 与 CLI 组件
 */
export function useAgent(workDir: string): UseAgentReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0, cost: 0 });
  const [sessionList, setSessionList] = useState<UseAgentReturn['sessionList']>([]);
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([]);

  // 使用 ref 保存可变对象（不触发重渲染）
  const configManagerRef = useRef<ConfigManager | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const providerRegistryRef = useRef<ProviderRegistry | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const skillLoaderRef = useRef<SkillLoader | null>(null);
  const messageIdCounter = useRef(0);

  const currentModelRef = useRef('');
  const currentProviderRef = useRef('');
  const pendingToolMsgIdRef = useRef<string | null>(null);
  const [currentModel, setCurrentModel] = useState('');
  const [currentProvider, setCurrentProvider] = useState('');

  // 初始化
  useEffect(() => {
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

      // 4. 初始化 Session Manager
      const sessionManager = new SessionManager();
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

      // 7. 初始化 Agent
      const toolRegistry = new ToolRegistry();
      const contextBuilder = new ContextBuilder();
      const agent = new Agent(
        provider,
        toolRegistry,
        sessionManager,
        skillLoader,
        contextBuilder,
        config,
      );
      agentRef.current = agent;

      currentModelRef.current = config.defaultModel;
      currentProviderRef.current = config.defaultProvider;
      setCurrentModel(config.defaultModel);
      setCurrentProvider(config.defaultProvider);

      // 8. 加载 session 列表
      setSessionList(sessionManager.list());

      // 9. SIGINT 处理
      const handleSigInt = () => {
        if (sessionRef.current) {
          sessionManager.save(sessionRef.current);
        }
        process.exit(0);
      };
      process.on('SIGINT', handleSigInt);

      return () => {
        process.off('SIGINT', handleSigInt);
      };
    } catch (err) {
      // 配置错误在 index.ts 中处理
      console.error(err instanceof Error ? err.message : String(err));
    }
  }, [workDir]);

  /** 生成消息 ID */
  const nextMessageId = (): string => {
    messageIdCounter.current += 1;
    return `msg_${messageIdCounter.current}`;
  };

  /** 发送消息 */
  const sendMessage = useCallback(async (text: string) => {
    if (!agentRef.current || !sessionRef.current || isProcessing) return;

    setIsProcessing(true);

    // 添加用户消息到 UI
    const userMsg: DisplayMessage = {
      id: nextMessageId(),
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);

    // 添加 assistant 消息占位（流式追加）
    const assistantMsgId = nextMessageId();
    const assistantMsg: DisplayMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const stream = agentRef.current.run(sessionRef.current, text);

      for await (const event of stream) {
        switch (event.type) {
          case 'text': {
            // 流式追加文本
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + event.content }
                  : m,
              ),
            );
            break;
          }
          case 'tool_call': {
            // 添加工具调用消息
            const toolMsgId = nextMessageId();
            pendingToolMsgIdRef.current = toolMsgId;
            const toolMsg: DisplayMessage = {
              id: toolMsgId,
              role: 'tool',
              content: '',
              toolName: event.name,
              toolParams: event.params,
            };
            setMessages((prev) => [...prev, toolMsg]);
            break;
          }
          case 'tool_result': {
            // 更新当前工具的结果（通过 ref 中的 ID 精确匹配）
            const toolMsgId = pendingToolMsgIdRef.current;
            if (toolMsgId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === toolMsgId
                    ? { ...m, toolResult: event.result, content: event.result.output }
                    : m,
                ),
              );
              pendingToolMsgIdRef.current = null;
            }
            break;
          }
          case 'error': {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + `\n[错误] ${event.message}`, isStreaming: false }
                  : m,
              ),
            );
            break;
          }
          case 'done': {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
              ),
            );
            // 更新 token 统计
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: m.content + `\n[错误] ${message}`, isStreaming: false }
            : m,
        ),
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      );
      setIsProcessing(false);
    }
  }, [isProcessing]);

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

      // 重建 agent
      const toolRegistry = new ToolRegistry();
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
      );
      agentRef.current = agent;

      sessionRef.current.provider = provider;
      currentProviderRef.current = provider;
      setCurrentProvider(provider);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

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
    refreshSessionList();
  }, []);

  /** 加载历史 Session */
  const loadSession = useCallback((id: string): boolean => {
    if (!sessionManagerRef.current) return false;
    const session = sessionManagerRef.current.load(id);
    if (!session) return false;
    sessionRef.current = session;

    // 转换 session 消息为 DisplayMessage
    const displayMsgs: DisplayMessage[] = session.messages.map((msg, i) => {
      if (typeof msg.content === 'string') {
        return {
          id: `msg_${i}`,
          role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'tool',
          content: msg.content,
        };
      }
      // ContentBlock[] 格式
      const blocks = msg.content;
      const textParts = blocks.filter((b) => b.type === 'text').map((b) => b.text || '');
      return {
        id: `msg_${i}`,
        role: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'tool',
        content: textParts.join(''),
      };
    });
    setMessages(displayMsgs);
    setCurrentModel(session.model);
    setCurrentProvider(session.provider);
    currentModelRef.current = session.model;
    currentProviderRef.current = session.provider;
    return true;
  }, []);

  /** 刷新 Session 列表 */
  const refreshSessionList = useCallback(() => {
    if (!sessionManagerRef.current) return;
    setSessionList(sessionManagerRef.current.list());
  }, []);

  return {
    messages,
    isProcessing,
    currentModel,
    currentProvider,
    tokenUsage,
    skills,
    sendMessage,
    switchModel,
    switchProvider,
    clearSession,
    loadSession,
    sessionList,
    refreshSessionList,
    config: configRef.current,
  };
}
