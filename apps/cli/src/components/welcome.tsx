import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { VERSION } from '@crab-science/shared';

interface WelcomeProps {
  model: string;
  provider: string;
  skillCount: number;
}

/**
 * 欢迎界面
 * ASCII Art Logo + 版本 + 启动步骤
 */
export function Welcome({ model, provider, skillCount }: WelcomeProps): React.ReactElement {
  const logo = [
    '  ██████ ██████  ███████ ███████     ██  ██████',
    ' ██      ██   ██ ██      ██          ██  ██   ██',
    ' ██      ██████  █████   ███████     ██  ██████',
    ' ██      ██   ██ ██           ██     ██  ██   ██',
    '  ██████ ██   ██ ███████ ███████     ██  ██   ██',
  ];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {logo.map((line, i) => (
        <Text key={i}>{chalk.cyan(line)}</Text>
      ))}
      <Text>
        {'\n'}
        {chalk.bold(`Crab-Science v${VERSION}`)} — {chalk.gray('可自我进化的科研 AI Agent')}
      </Text>
      <Text color="gray">
        {'\n'}
        {'[1/3] '}
        {chalk.green('✓')} 检查配置...
        {'\n'}
        {'[2/3] '}
        {chalk.green('✓')} 加载 skills ({skillCount} 个)...
        {'\n'}
        {'[3/3] '}
        {chalk.green('✓')} 连接 LLM ({provider}/{model})...
      </Text>
      <Text>
        {'\n'}
        {chalk.green('✅ 就绪！')}输入你的科研任务，或输入{' '}
        {chalk.cyan('/help')} 查看帮助。
      </Text>
    </Box>
  );
}
