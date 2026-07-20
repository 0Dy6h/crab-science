import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { useAgent } from './hooks/use-agent.js';
import { StatusBar } from './components/status-bar.js';
import { MessageList } from './components/message-list.js';
import { InputBox } from './components/input-box.js';
import { Welcome } from './components/welcome.js';
import { CommandHandler } from './commands/handler.js';
import type { DisplayMessage } from './hooks/use-agent.js';

interface AppProps {
  workDir: string;
}

/**
 * 主应用组件
 * Ink 根组件，管理整体布局和用户交互
 */
export function App({ workDir }: AppProps): React.ReactElement {
  const agent = useAgent(workDir);
  const [showWelcome, setShowWelcome] = useState(true);
  const [systemMessages, setSystemMessages] = useState<DisplayMessage[]>([]);

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
          };
          setSystemMessages((prev) => [...prev, sysMsg]);
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
      <Box flexDirection="column" flexGrow={1}>
        {showWelcome && (
          <Welcome
            model={agent.currentModel}
            provider={agent.currentProvider}
            skillCount={agent.skills.length}
          />
        )}
        <MessageList messages={allMessages} />
      </Box>
      <Box>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>
      <InputBox onSubmit={handleSubmit} isProcessing={agent.isProcessing} />
    </Box>
  );
}
