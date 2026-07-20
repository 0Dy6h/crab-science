import * as fs from 'fs';
import * as path from 'path';
import type { ToolParameterSchema, ToolResult, ToolContext } from '@crab-science/shared';
import { isPathWithin } from '@crab-science/shared';
import type { Tool } from './types.js';

/**
 * Write 工具
 * 创建或完全覆盖文件，自动创建父目录
 */
export class WriteTool implements Tool {
  readonly name = 'write';
  readonly description = '创建或完全覆盖文件内容，自动创建不存在的父目录。';
  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于工作目录）',
      },
      content: {
        type: 'string',
        description: '要写入的完整文件内容',
      },
    },
    required: ['path', 'content'],
  };

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = params.path as string;
    const content = params.content as string;

    if (!filePath) {
      return { success: false, output: '', error: 'path 参数不能为空' };
    }
    if (content === undefined || content === null) {
      return { success: false, output: '', error: 'content 参数不能为空' };
    }

    try {
      const absPath = path.resolve(ctx.workDir, filePath);

      // 路径安全检查
      if (!isPathWithin(absPath, ctx.workDir)) {
        return {
          success: false,
          output: '',
          error: `路径越界: ${filePath} 不在工作目录 ${ctx.workDir} 内`,
        };
      }

      // 自动创建父目录
      const dirPath = path.dirname(absPath);
      this.ensureDir(dirPath);

      // 写入文件
      fs.writeFileSync(absPath, content, 'utf-8');

      const lineCount = content.split('\n').length;
      const byteCount = Buffer.byteLength(content, 'utf-8');

      return {
        success: true,
        output: `已写入 ${filePath} (${lineCount} 行, ${byteCount} 字节)`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: `写入失败: ${message}` };
    }
  }

  /**
   * 确保目录存在（递归创建）
   */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
