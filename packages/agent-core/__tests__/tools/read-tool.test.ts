import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ReadTool } from '../../src/tools/read-tool.js';
import type { ToolContext } from '@crab-science/shared';

describe('ReadTool', () => {
  let workDir: string;
  let ctx: ToolContext;
  let tool: ReadTool;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-test-'));
    ctx = { workDir, sessionId: 'test-session' };
    tool = new ReadTool();
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('应具有正确的工具名称', () => {
    expect(tool.name).toBe('read');
  });

  it('应具有参数 schema 包含 path', () => {
    expect(tool.parameters.properties).toHaveProperty('path');
    expect(tool.parameters.required).toContain('path');
  });

  it('应成功读取单个文件', async () => {
    const filePath = 'test.txt';
    const content = 'Hello, World!\nThis is a test file.';
    fs.writeFileSync(path.join(workDir, filePath), content);

    const result = await tool.execute({ path: filePath }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello, World!');
    expect(result.output).toContain('This is a test file.');
    expect(result.output).toContain('2 行');
  });

  it('应在文件不存在时返回错误', async () => {
    const result = await tool.execute({ path: 'nonexistent.txt' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('文件不存在');
  });

  it('应在路径越界时返回错误', async () => {
    // 使用绝对路径逃逸工作目录
    const outsidePath = path.join(os.tmpdir(), 'outside-file.txt');
    fs.writeFileSync(outsidePath, 'secret');

    const result = await tool.execute({ path: outsidePath }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');

    fs.unlinkSync(outsidePath);
  });

  it('应使用 .. 逃逸时返回路径越界错误', async () => {
    const result = await tool.execute({ path: '../../../etc/passwd' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('应在 path 参数为空时返回错误', async () => {
    const result = await tool.execute({ path: '' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('path 参数不能为空');
  });

  it('应读取目录并返回条目列表', async () => {
    fs.writeFileSync(path.join(workDir, 'file1.txt'), 'content1');
    fs.writeFileSync(path.join(workDir, 'file2.txt'), 'content2');
    fs.mkdirSync(path.join(workDir, 'subdir'));

    const result = await tool.execute({ path: '.' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('file1.txt');
    expect(result.output).toContain('file2.txt');
    expect(result.output).toContain('subdir');
  });

  it('应支持 glob 模式匹配多文件', async () => {
    fs.writeFileSync(path.join(workDir, 'a.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(workDir, 'b.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(workDir, 'c.js'), 'const c = 3;');

    const result = await tool.execute({ path: '*.ts' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('a.ts');
    expect(result.output).toContain('b.ts');
    expect(result.output).not.toContain('c.js');
  });

  it('glob 匹配无结果时应返回提示', async () => {
    const result = await tool.execute({ path: '*.nonexistent' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('未找到匹配');
  });

  it('应截断超过 500 行的大文件', async () => {
    const filePath = 'large.txt';
    const lines: string[] = [];
    for (let i = 1; i <= 600; i++) {
      lines.push(`Line ${i}`);
    }
    fs.writeFileSync(path.join(workDir, filePath), lines.join('\n'));

    const result = await tool.execute({ path: filePath }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('已截断');
    expect(result.output).toContain('600 行');
    // 应包含前 500 行但不包含第 600 行
    expect(result.output).toContain('Line 1');
    expect(result.output).toContain('Line 500');
    expect(result.output).not.toContain('Line 600');
  });

  it('glob 匹配应返回文件预览内容', async () => {
    fs.writeFileSync(path.join(workDir, 'data.csv'), 'col1,col2\nval1,val2\nval3,val4');

    const result = await tool.execute({ path: '*.csv' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('data.csv');
    expect(result.output).toContain('col1,col2');
  });

  it('glob 匹配应忽略 node_modules 和 dist 目录', async () => {
    fs.mkdirSync(path.join(workDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'node_modules', 'pkg.ts'), 'should not match');
    fs.mkdirSync(path.join(workDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'dist', 'build.ts'), 'should not match');
    fs.writeFileSync(path.join(workDir, 'src.ts'), 'should match');

    const result = await tool.execute({ path: '**/*.ts' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('src.ts');
    expect(result.output).not.toContain('node_modules');
    expect(result.output).not.toContain('dist');
  });
});
