import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BashTool } from '../../src/tools/bash-tool.js';
import type { ToolContext } from '@crab-science/shared';

describe('BashTool', () => {
  let workDir: string;
  let ctx: ToolContext;
  let tool: BashTool;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-test-'));
    ctx = { workDir, sessionId: 'test-session' };
    tool = new BashTool();
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('应具有正确的工具名称', () => {
    expect(tool.name).toBe('bash');
  });

  it('应具有参数 schema 包含 command 和可选 timeout', () => {
    expect(tool.parameters.properties).toHaveProperty('command');
    expect(tool.parameters.properties).toHaveProperty('timeout');
    expect(tool.parameters.required).toContain('command');
    expect(tool.parameters.required).not.toContain('timeout');
  });

  it('应成功执行命令并返回 stdout', async () => {
    const result = await tool.execute({ command: 'echo "hello world"' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello world');
    expect(result.output).toContain('[stdout]');
    expect(result.output).toContain('[exit code] 0');
  });

  it('应捕获 stderr 输出', async () => {
    const result = await tool.execute(
      { command: 'echo "error message" >&2' },
      ctx,
    );

    expect(result.output).toContain('[stderr]');
    expect(result.output).toContain('error message');
  });

  it('应正确报告非零退出码', async () => {
    const result = await tool.execute(
      { command: 'exit 42' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('42');
  });

  it('应在正确的工作目录中执行命令', async () => {
    // 在工作目录中创建一个文件
    fs.writeFileSync(path.join(workDir, 'marker.txt'), 'found');

    const result = await tool.execute(
      { command: 'cat marker.txt' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('found');
  });

  it('应能使用 pwd 确认工作目录', async () => {
    const result = await tool.execute({ command: 'pwd' }, ctx);

    expect(result.success).toBe(true);
    // Git Bash 可能将 Windows 路径转换为 Unix 风格，检查目录名是否匹配
    const dirName = path.basename(workDir);
    expect(result.output).toContain(dirName);
  });

  it('应在 command 参数为空时返回错误', async () => {
    const result = await tool.execute({ command: '' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('command 参数不能为空');
  });

  it('应支持多行命令输出', async () => {
    const result = await tool.execute(
      { command: 'echo "line1" && echo "line2" && echo "line3"' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('line1');
    expect(result.output).toContain('line2');
    expect(result.output).toContain('line3');
  });

  it('应支持自定义超时参数', async () => {
    const result = await tool.execute(
      { command: 'echo "fast"', timeout: 5000 },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('fast');
  });

  it('应在超时时终止命令', async () => {
    // 使用 sleep 命令测试超时（设置 500ms 超时）
    const result = await tool.execute(
      { command: 'sleep 10', timeout: 500 },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
  });

  it('应能执行管道命令', async () => {
    const result = await tool.execute(
      { command: 'echo "hello world" | tr " " "\\n"' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('hello');
    expect(result.output).toContain('world');
  });

  it('应同时返回 stdout 和 stderr', async () => {
    const result = await tool.execute(
      { command: 'echo "to stdout" && echo "to stderr" >&2' },
      ctx,
    );

    expect(result.output).toContain('[stdout]');
    expect(result.output).toContain('to stdout');
    expect(result.output).toContain('[stderr]');
    expect(result.output).toContain('to stderr');
  });

  it('应正确处理命令中不存在的命令', async () => {
    const result = await tool.execute(
      { command: 'nonexistent_command_xyz123' },
      ctx,
    );

    expect(result.success).toBe(false);
  });
});
