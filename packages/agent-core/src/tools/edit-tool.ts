import * as fs from 'fs';
import * as path from 'path';
import type { ToolParameterSchema, ToolResult, ToolContext } from '@crab-science/shared';
import { isPathWithin } from '@crab-science/shared';
import type { Tool } from './types.js';

/**
 * Edit 工具
 * 精确编辑文件：将 old_string 替换为 new_string
 * 要求 old_string 在文件中唯一匹配
 */
export class EditTool implements Tool {
  readonly name = 'edit';
  readonly description = '精确编辑文件：将 old_string 替换为 new_string。要求 old_string 在文件中唯一匹配，匹配多处或不匹配时报错。';
  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径（相对于工作目录）',
      },
      old_string: {
        type: 'string',
        description: '要被替换的原始文本（必须在文件中唯一匹配）',
      },
      new_string: {
        type: 'string',
        description: '替换后的新文本',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  };

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = params.path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;

    if (!filePath) {
      return { success: false, output: '', error: 'path 参数不能为空' };
    }
    if (oldString === undefined || oldString === null) {
      return { success: false, output: '', error: 'old_string 参数不能为空' };
    }
    if (newString === undefined || newString === null) {
      return { success: false, output: '', error: 'new_string 参数不能为空' };
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

      if (!fs.existsSync(absPath)) {
        return { success: false, output: '', error: `文件不存在: ${filePath}` };
      }

      // 读取文件内容
      const content = fs.readFileSync(absPath, 'utf-8');

      // 统计匹配次数
      const matchCount = this.countMatches(content, oldString);

      if (matchCount === 0) {
        return {
          success: false,
          output: '',
          error: `old_string 在文件 ${filePath} 中未找到。请检查文本是否正确。`,
        };
      }

      if (matchCount > 1) {
        return {
          success: false,
          output: '',
          error: `old_string 在文件 ${filePath} 中匹配了 ${matchCount} 处。请提供更长的上下文以确保唯一匹配。`,
        };
      }

      // 执行替换
      const newContent = content.replace(oldString, newString);
      fs.writeFileSync(absPath, newContent, 'utf-8');

      const oldLines = content.split('\n').length;
      const newLines = newContent.split('\n').length;
      const diff = newLines - oldLines;

      return {
        success: true,
        output: `已编辑 ${filePath} (行数: ${oldLines} → ${newLines}, ${diff >= 0 ? '+' : ''}${diff} 行)`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: `编辑失败: ${message}` };
    }
  }

  /**
   * 统计子字符串出现次数
   */
  private countMatches(content: string, searchString: string): number {
    if (!searchString) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = content.indexOf(searchString, pos)) !== -1) {
      count++;
      pos += searchString.length;
    }
    return count;
  }
}
