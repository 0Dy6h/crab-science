import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolParameterSchema, ToolResult, ToolContext } from '@crab-science/shared';
import { DEFAULT_BASH_TIMEOUT_MS, MAX_TOOL_OUTPUT_LINES, truncateOutput } from '@crab-science/shared';
import type { Tool } from './types.js';

const execAsync = promisify(exec);

/**
 * Bash 工具
 * 在工作目录内执行 shell 命令，支持超时控制
 */
export class BashTool implements Tool {
  readonly name = 'bash';
  readonly description = '在工作目录内执行 shell 命令，返回 stdout + stderr + exit code。支持超时控制（默认 30 秒）。';
  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令',
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 30000',
      },
    },
    required: ['command'],
  };

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = params.command as string;
    const timeout = (params.timeout as number) ?? DEFAULT_BASH_TIMEOUT_MS;

    if (!command) {
      return { success: false, output: '', error: 'command 参数不能为空' };
    }

    try {
      const result = await this.executeCommand(command, ctx.workDir, timeout);

      const parts: string[] = [];
      if (result.stdout) {
        parts.push(`[stdout]\n${truncateOutput(result.stdout, MAX_TOOL_OUTPUT_LINES)}`);
      }
      if (result.stderr) {
        parts.push(`[stderr]\n${truncateOutput(result.stderr, MAX_TOOL_OUTPUT_LINES)}`);
      }
      parts.push(`[exit code] ${result.exitCode}`);

      return {
        success: result.exitCode === 0,
        output: parts.join('\n\n'),
        error: result.exitCode !== 0 ? `命令退出码: ${result.exitCode}` : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // exec 超时或非零退出码时 err 包含 stdout/stderr
      const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean; signal?: string };
      const parts: string[] = [];

      if (execErr.stdout) {
        parts.push(`[stdout]\n${truncateOutput(execErr.stdout, MAX_TOOL_OUTPUT_LINES)}`);
      }
      if (execErr.stderr) {
        parts.push(`[stderr]\n${truncateOutput(execErr.stderr, MAX_TOOL_OUTPUT_LINES)}`);
      }

      if (execErr.killed || execErr.signal === 'SIGTERM') {
        parts.push(`[超时] 命令在 ${timeout}ms 后被终止`);
        return {
          success: false,
          output: parts.join('\n\n') || '命令执行超时',
          error: `命令超时（${timeout}ms）`,
        };
      }

      parts.push(`[exit code] ${execErr.code ?? 1}`);
      return {
        success: false,
        output: parts.join('\n\n') || message,
        error: message,
      };
    }
  }

  /**
   * 执行命令
   * Windows 下自动设置 UTF-8 编码，解决中文输出乱码
   */
  private async executeCommand(
    command: string,
    cwd: string,
    timeout: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const isWindows = process.platform === 'win32';
    // Windows: 切换控制台到 UTF-8，设置 Python UTF-8 模式
    const finalCommand = isWindows ? `chcp 65001 >nul 2>&1 && ${command}` : command;
    const env = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    };

    const { stdout, stderr } = await execAsync(finalCommand, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 10, // 10MB
      env,
      encoding: 'utf-8',
    });

    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
    };
  }
}
