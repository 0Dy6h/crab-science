import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { useAgent } from './hooks/use-agent.js';
import { StatusBar } from './components/status-bar.js';
import { MessageList } from './components/message-list.js';
import { InputBox } from './components/input-box.js';
import { Welcome } from './components/welcome.js';
import { TreeView } from './components/tree-view.js';
import { CommandHandler } from './commands/handler.js';
import type { DisplayMessage } from './hooks/use-agent.js';

interface AppProps {
  workDir: string;
}

/**
 * 主应用组件（Phase 2 增强）
 *
 * Ink 根组件，管理整体布局和用户交互。
 * Phase 2 新增：树形视图面板、Extension 状态显示。
 */
export function App({ workDir }: AppProps): React.ReactElement {
  const agent = useAgent(workDir);
  const [showWelcome, setShowWelcome] = useState(true);
  const [systemMessages, setSystemMessages] = useState<DisplayMessage[]>([]);
  const [showTreeView, setShowTreeView] = useState(false);

  const handleSubmit = useCallback(
    (text: string) => {
      // 隐藏欢迎界面
      setShowWelcome(false);

      // 处理斜杠命令（每次创建新 handler 以获取最新 agent 状态）
      const handler = new CommandHandler(agent);
      const result = handler.handle(text);
      if (result.handled) {
        if (result.output) {
          const sysMsg: DisplayMessage = {
            id: `sys_${Date.now()}`,
            role: 'assistant',
            content: result.output,
            isSystem: true,
          };
          setSystemMessages((prev) => [...prev, sysMsg]);
        }
        if (result.refreshTree) {
          // 触发树视图刷新
          setShowTreeView(false);
        }
        if (result.exit) {
          process.exit(0);
        }
        return;
      }

      // 普通消息交给 agent 处理
      agent.sendMessage(text);
    },
    [agent],
  );

  // 合并系统消息和 agent 消息
  const allMessages = [...systemMessages, ...agent.messages];

  // 获取树视图数据
  const tree = agent.getTree();
  const nodes = agent.getNodes();
  const currentNodeId = agent.getCurrentNodeId();
  const rootId = tree?.root?.id ?? '';

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        model={agent.currentModel}
        provider={agent.currentProvider}
        inputTokens={agent.tokenUsage.inputTokens}
        outputTokens={agent.tokenUsage.outputTokens}
        cost={agent.tokenUsage.cost}
        isProcessing={agent.isProcessing}
      />
      <Box>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>

      {/* Extensions 状态指示器 */}
      {agent.extensions.length > 0 && (
        <Box paddingLeft={1}>
          <Text color="gray">
            {chalk.cyan('ext')} {agent.extensions.filter((e) => e.status === 'loaded').length}/{agent.extensions.length} loaded
            {' | '}
            {chalk.cyan('node')} {currentNodeId.substring(0, 8) || 'none'}
          </Text>
        </Box>
      )}

      {/* Phase 3: 进化状态指示器 */}
      {agent.subagents.length > 0 && (
        <Box paddingLeft={1}>
          <Text color="gray">
            {chalk.magenta('evo')} {chalk.magenta('sa')} {agent.subagents.length} subagents
          </Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1}>
        {showWelcome && (
          <Welcome
            model={agent.currentModel}
            provider={agent.currentProvider}
            skillCount={agent.skills.length}
          />
        )}
        {showTreeView && rootId ? (
          <TreeView
            nodes={nodes}
            rootId={rootId}
            currentNodeId={currentNodeId}
            isActive={showTreeView}
            onClose={() => setShowTreeView(false)}
          />
        ) : (
          <MessageList messages={allMessages} />
        )}
      </Box>
      <Box>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>
      <InputBox onSubmit={handleSubmit} isProcessing={agent.isProcessing} />
    </Box>
  );
}
