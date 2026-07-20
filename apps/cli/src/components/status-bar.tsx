import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { VERSION, formatTokens, formatCost } from '@crab-science/shared';

interface StatusBarProps {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  isProcessing: boolean;
}

/**
 * 顶部状态栏
 * 显示版本、模型、Token、成本、运行状态
 */
export function StatusBar({
  model,
  provider,
  inputTokens,
  outputTokens,
  cost,
  isProcessing,
}: StatusBarProps): React.ReactElement {
  const totalTokens = inputTokens + outputTokens;
  const status = isProcessing ? chalk.yellow('● 运行中') : chalk.green('○ 空闲');

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text>
        {chalk.cyan(`Crab-Science v${VERSION}`)}
      </Text>
      <Text>
        {chalk.gray('[')}
        {chalk.blue(provider)}
        {chalk.gray('/')}
        {chalk.green(model)}
        {chalk.gray(']')}
      </Text>
      <Text>
        {chalk.gray('[')}
        {chalk.yellow(`Token: ${formatTokens(totalTokens)}`)}
        {chalk.gray(']')}
      </Text>
      <Text>
        {chalk.gray('[')}
        {chalk.magenta(formatCost(cost))}
        {chalk.gray(']')}
      </Text>
      <Text>{status}</Text>
    </Box>
  );
}
