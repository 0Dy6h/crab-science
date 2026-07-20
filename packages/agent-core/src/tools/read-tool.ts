import * as fs from 'fs';
import * as path from 'path';
import fastGlob from 'fast-glob';
import type { ToolParameterSchema, ToolResult, ToolContext } from '@crab-science/shared';
import {
  MAX_FILE_LINES,
  GLOB_PREVIEW_LINES,
  isGlobPattern,
  isPathWithin,
  truncateOutput,
} from '@crab-science/shared';
import type { Tool } from './types.js';

/**
 * Read 工具
 * 读取文件内容，支持 glob 模式匹配
 */
export class ReadTool implements Tool {
  readonly name = 'read';
  readonly description = '读取文件内容，支持 glob 模式匹配（如 **/*.csv）。返回文件内容或匹配文件列表。';
  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径或 glob 模式（如 src/**/*.ts）',
      },
    },
    required: ['path'],
  };

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = params.path as string;
    if (!filePath) {
      return { success: false, output: '', error: 'path 参数不能为空' };
    }

    try {
      // 检测 glob 模式
      if (isGlobPattern(filePath)) {
        return this.globFiles(filePath, ctx.workDir);
      }

      // 单文件读取
      return this.readFile(filePath, ctx.workDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: `读取失败: ${message}` };
    }
  }

  /**
   * 读取单个文件
   */
  private readFile(filePath: string, workDir: string): ToolResult {
    const absPath = path.resolve(workDir, filePath);

    // 路径安全检查
    if (!isPathWithin(absPath, workDir)) {
      return {
        success: false,
        output: '',
        error: `路径越界: ${filePath} 不在工作目录 ${workDir} 内`,
      };
    }

    if (!fs.existsSync(absPath)) {
      return { success: false, output: '', error: `文件不存在: ${filePath}` };
    }

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(absPath);
      return {
        success: true,
        output: `目录 ${filePath} 包含 ${entries.length} 个条目:\n${entries.join('\n')}`,
      };
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');
    const truncated = truncateOutput(content, MAX_FILE_LINES);

    return {
      success: true,
      output: `${filePath} (${lines.length} 行)\n\n${truncated}`,
    };
  }

  /**
   * Glob 匹配文件
   */
  private globFiles(pattern: string, workDir: string): ToolResult {
    const matches = fastGlob.sync(pattern, {
      cwd: workDir,
      absolute: false,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    if (matches.length === 0) {
      return {
        success: true,
        output: `未找到匹配 "${pattern}" 的文件`,
      };
    }

    // 返回匹配文件列表 + 每个文件的摘要
    const parts: string[] = [`找到 ${matches.length} 个匹配 "${pattern}" 的文件:\n`];

    for (const match of matches.slice(0, 20)) {
      const absPath = path.resolve(workDir, match);
      if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
        const content = fs.readFileSync(absPath, 'utf-8');
        const lines = content.split('\n');
        const preview = lines.slice(0, GLOB_PREVIEW_LINES).join('\n');
        parts.push(`--- ${match} (${lines.length} 行) ---\n${preview}\n`);
      } else {
        parts.push(`--- ${match} (目录) ---\n`);
      }
    }

    if (matches.length > 20) {
      parts.push(`\n... 还有 ${matches.length - 20} 个文件未显示`);
    }

    return {
      success: true,
      output: parts.join('\n'),
    };
  }
}
