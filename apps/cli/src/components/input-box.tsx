import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';

interface InputBoxProps {
  onSubmit: (text: string) => void | Promise<void>;
  isProcessing: boolean;
}

/**
 * 底部输入框
 * 支持 Enter 发送、显示处理中状态
 */
export function InputBox({ onSubmit, isProcessing }: InputBoxProps): React.ReactElement {
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isProcessing) return;
    onSubmit(trimmed);
    setInput('');
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {isProcessing ? (
            <Text color="yellow">
              <Spinner type="dots" /> {' '}
            </Text>
          ) : (
            chalk.cyan('> ')
          )}
        </Text>
        {isProcessing ? (
          <Text color="gray">处理中... (Ctrl+C 中断并保存)</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="输入消息... (/help 查看命令)"
          />
        )}
      </Box>
      <Text color="gray" dimColor>
        {' '}
        Shift+Enter 换行 | /help 帮助 | /exit 退出
      </Text>
    </Box>
  );
}
