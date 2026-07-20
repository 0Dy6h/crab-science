#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import { App } from './app.js';
import { ConfigManager } from '@crab-science/agent-core';
import chalk from 'chalk';

/**
 * CLI 入口
 * 解析参数 → 验证配置 → 选择工作目录 → 渲染 Ink App
 */

/** 解析命令行参数 */
function parseArgs(): { workDir?: string; model?: string; provider?: string } {
  const args = process.argv.slice(2);
  const result: { workDir?: string; model?: string; provider?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--workdir':
      case '-w':
        result.workDir = args[++i];
        break;
      case '--model':
      case '-m':
        result.model = args[++i];
        break;
      case '--provider':
      case '-p':
        result.provider = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
${chalk.cyan('Crab-Science')} — 可自我进化的科研 AI Agent

${chalk.bold('用法:')}
  crab-science [options]

${chalk.bold('选项:')}
  -w, --workdir <path>    工作目录（不指定则启动时交互选择）
  -m, --model <name>      指定模型
  -p, --provider <name>   指定 Provider (openai/anthropic/deepseek)
  -h, --help              显示帮助

${chalk.bold('环境变量:')}
  CRAB_SCIENCE_OPENAI_API_KEY     OpenAI API Key
  CRAB_SCIENCE_ANTHROPIC_API_KEY  Anthropic API Key
  CRAB_SCIENCE_DEEPSEEK_API_KEY   DeepSeek API Key

${chalk.bold('示例:')}
  crab-science
  crab-science --workdir /path/to/project
  crab-science --provider deepseek --model deepseek-chat
`);
        process.exit(0);
        break;
    }
  }

  return result;
}

/**
 * 交互式选择工作目录
 * 如果 --workdir 已指定则直接使用；否则提示用户确认或输入新路径
 */
function selectWorkDir(configWorkDir: string, cliWorkDir?: string): Promise<string> {
  // 命令行指定了 --workdir，直接使用
  if (cliWorkDir) {
    const resolved = path.resolve(cliWorkDir);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    return Promise.resolve(resolved);
  }

  // 交互选择
  const defaultDir = path.resolve(configWorkDir);

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan('\n🦀 Crab-Science — 工作目录选择\n'));
    console.log(chalk.gray(`  当前配置目录: ${defaultDir}`));
    console.log(chalk.gray(`  当前运行目录: ${process.cwd()}`));
    console.log(chalk.gray('  Agent 创建的文件会保存在工作目录中。\n'));

    rl.question(chalk.yellow('  按 Enter 使用配置目录，或输入新路径: '), (answer: string) => {
      const trimmed = answer.trim();

      if (!trimmed) {
        // 使用默认目录
        rl.close();
        resolve(defaultDir);
      } else {
        // 用户输入了新路径
        const resolved = path.resolve(trimmed);
        if (!fs.existsSync(resolved)) {
          try {
            fs.mkdirSync(resolved, { recursive: true });
            console.log(chalk.green(`  ✓ 已创建目录: ${resolved}\n`));
          } catch {
            console.log(chalk.red(`  ✗ 无法创建目录，使用默认: ${defaultDir}\n`));
            rl.close();
            resolve(defaultDir);
            return;
          }
        } else {
          console.log(chalk.green(`  ✓ 使用目录: ${resolved}\n`));
        }
        rl.close();
        resolve(resolved);
      }
    });
  });
}

/** 主函数 */
async function main(): Promise<void> {
  const args = parseArgs();

  // 验证配置
  let configWorkDir: string;
  try {
    const configManager = new ConfigManager();
    configManager.ensureConfigDir();
    const validation = configManager.validate();

    if (!validation.valid) {
      console.error(chalk.red('\n❌ 配置验证失败:\n'));
      for (const error of validation.errors) {
        console.error(chalk.red(`  • ${error}`));
      }
      console.error(chalk.yellow('\n请修复以上问题后重试。\n'));
      process.exit(1);
    }

    const config = configManager.load();
    configWorkDir = config.workDir;

    // 应用命令行参数覆盖
    if (args.provider || args.model) {
      if (args.provider) {
        config.defaultProvider = args.provider as 'openai' | 'anthropic' | 'deepseek';
      }
      if (args.model) {
        config.defaultModel = args.model;
      }
      configManager.save(config);
    }
  } catch (err) {
    console.error(chalk.red('\n❌ 初始化失败:\n'));
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    console.error(
      chalk.yellow('\n提示: 请设置 API Key 环境变量:\n') +
        chalk.gray('  $env:CRAB_SCIENCE_DEEPSEEK_API_KEY="your-key"\n') +
        chalk.gray('  # 或\n') +
        chalk.gray('  $env:CRAB_SCIENCE_ANTHROPIC_API_KEY="your-key"\n') +
        chalk.gray('  $env:CRAB_SCIENCE_OPENAI_API_KEY="your-key"\n'),
    );
    process.exit(1);
  }

  // 交互式选择工作目录
  const workDir = await selectWorkDir(configWorkDir, args.workDir);

  // 渲染 CLI
  try {
    render(React.createElement(App, { workDir }));
  } catch (err) {
    console.error(chalk.red('\n❌ CLI 渲染失败:\n'));
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

main();
