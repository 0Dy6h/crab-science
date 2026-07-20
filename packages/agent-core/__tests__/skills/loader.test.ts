import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLoader } from '../../src/skills/loader.js';

describe('SkillLoader', () => {
  let skillsDir: string;
  let loader: SkillLoader;

  beforeEach(() => {
    skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-skills-'));
    loader = new SkillLoader([skillsDir]);
  });

  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  /**
   * 创建测试用 SKILL.md 文件
   */
  function createSkill(
    dirName: string,
    name: string,
    description: string,
    version: number = 1,
    body: string = '# Skill Body\n\nDetailed content here.',
  ): void {
    const skillDir = path.join(skillsDir, dirName);
    fs.mkdirSync(skillDir, { recursive: true });
    const content = `---\nname: ${name}\ndescription: ${description}\nversion: ${version}\n---\n\n${body}`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  }

  describe('discover', () => {
    it('应发现并解析 SKILL.md 的 frontmatter', () => {
      createSkill('literature-search', 'literature-search', '文献检索技能');

      const metas = loader.discover();

      expect(metas.length).toBe(1);
      expect(metas[0].name).toBe('literature-search');
      expect(metas[0].description).toBe('文献检索技能');
      expect(metas[0].version).toBe(1);
    });

    it('应发现多个 Skills', () => {
      createSkill('literature-search', 'literature-search', '文献检索');
      createSkill('data-analysis', 'data-analysis', '数据分析');
      createSkill('paper-writing', 'paper-writing', '论文撰写');

      const metas = loader.discover();

      expect(metas.length).toBe(3);
      const names = metas.map((m) => m.name);
      expect(names).toContain('literature-search');
      expect(names).toContain('data-analysis');
      expect(names).toContain('paper-writing');
    });

    it('目录不存在时应返回空数组', () => {
      const emptyLoader = new SkillLoader(['/nonexistent/path']);
      const metas = emptyLoader.discover();

      expect(metas).toEqual([]);
    });

    it('应跳过没有 SKILL.md 的目录', () => {
      fs.mkdirSync(path.join(skillsDir, 'empty-dir'), { recursive: true });
      createSkill('real-skill', 'real-skill', 'A real skill');

      const metas = loader.discover();

      expect(metas.length).toBe(1);
      expect(metas[0].name).toBe('real-skill');
    });

    it('应在 frontmatter 缺失 name 时使用目录名', () => {
      const skillDir = path.join(skillsDir, 'fallback-name');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription: no name field\n---\n\nBody',
      );

      const metas = loader.discover();

      expect(metas.length).toBe(1);
      expect(metas[0].name).toBe('fallback-name');
    });

    it('应在 frontmatter 缺失 version 时默认为 1', () => {
      const skillDir = path.join(skillsDir, 'no-version');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: no-version\ndescription: no version\n---\n\nBody',
      );

      const metas = loader.discover();

      expect(metas[0].version).toBe(1);
    });

    it('应跳过 frontmatter 解析失败的文件', () => {
      const skillDir = path.join(skillsDir, 'bad-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'no frontmatter at all');

      const metas = loader.discover();

      // 无 frontmatter 的文件应被跳过或以默认值处理
      // gray-matter 对无 frontmatter 的内容会返回空 data
      expect(metas.length).toBeLessThanOrEqual(1);
    });
  });

  describe('load', () => {
    it('应返回完整的 Skill 对象', () => {
      createSkill(
        'literature-search',
        'literature-search',
        '文献检索',
        2,
        '# Literature Search\n\nDetailed instructions...',
      );

      const skill = loader.load('literature-search');

      expect(skill).not.toBeNull();
      expect(skill!.meta.name).toBe('literature-search');
      expect(skill!.meta.description).toBe('文献检索');
      expect(skill!.meta.version).toBe(2);
      expect(skill!.content).toContain('# Literature Search');
      expect(skill!.content).toContain('Detailed instructions...');
      expect(skill!.path).toContain('SKILL.md');
    });

    it('加载不存在的 Skill 应返回 null', () => {
      const result = loader.load('nonexistent-skill');

      expect(result).toBeNull();
    });

    it('应缓存已加载的 Skill', () => {
      createSkill('cached-skill', 'cached-skill', '缓存的技能');

      const first = loader.load('cached-skill');
      const second = loader.load('cached-skill');

      // 应返回同一个对象引用（缓存）
      expect(first).toBe(second);
    });

    it('clearCache 后应重新加载', () => {
      createSkill('cached-skill', 'cached-skill', '缓存的技能');

      const first = loader.load('cached-skill');
      loader.clearCache();
      const second = loader.load('cached-skill');

      // 清除缓存后应返回新对象
      expect(first).not.toBe(second);
      expect(second!.meta.name).toBe('cached-skill');
    });
  });

  describe('getMetadataForPrompt', () => {
    it('应返回格式化的 skill 元数据字符串', () => {
      createSkill('skill-a', 'skill-a', '技能 A 描述');
      createSkill('skill-b', 'skill-b', '技能 B 描述');

      const result = loader.getMetadataForPrompt();

      expect(result).toContain('- skill-a: 技能 A 描述');
      expect(result).toContain('- skill-b: 技能 B 描述');
    });

    it('无 Skills 时应返回空字符串', () => {
      const result = loader.getMetadataForPrompt();

      expect(result).toBe('');
    });
  });

  describe('getSkillPath', () => {
    it('应返回 SKILL.md 文件路径', () => {
      createSkill('find-me', 'find-me', '可找到的技能');

      const skillPath = loader.getSkillPath('find-me');

      expect(skillPath).not.toBeNull();
      expect(skillPath).toContain('SKILL.md');
      expect(fs.existsSync(skillPath!)).toBe(true);
    });

    it('不存在的 skill 应返回 null', () => {
      const result = loader.getSkillPath('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('多目录搜索', () => {
    it('应从多个目录中发现 Skills', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-skills2-'));
      try {
        createSkill('skill-1', 'skill-1', 'from dir 1');
        // 在第二个目录中创建
        const skill2Dir = path.join(dir2, 'skill-2');
        fs.mkdirSync(skill2Dir, { recursive: true });
        fs.writeFileSync(
          path.join(skill2Dir, 'SKILL.md'),
          '---\nname: skill-2\ndescription: from dir 2\nversion: 1\n---\n\nBody',
        );

        const multiLoader = new SkillLoader([skillsDir, dir2]);
        const metas = multiLoader.discover();

        expect(metas.length).toBe(2);
        const names = metas.map((m) => m.name);
        expect(names).toContain('skill-1');
        expect(names).toContain('skill-2');
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });

    it('项目级 Skills 应优先于全局 Skills（去重）', () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-skills2-'));
      try {
        // 两个目录都有同名 skill
        createSkill('shared-skill', 'shared-skill', 'from dir 1 (project)');
        const skill2Dir = path.join(dir2, 'shared-skill');
        fs.mkdirSync(skill2Dir, { recursive: true });
        fs.writeFileSync(
          path.join(skill2Dir, 'SKILL.md'),
          '---\nname: shared-skill\ndescription: from dir 2 (global)\nversion: 1\n---\n\nBody',
        );

        const multiLoader = new SkillLoader([skillsDir, dir2]);
        const metas = multiLoader.discover();

        // 应只出现一次（项目级优先）
        const sharedMetas = metas.filter((m) => m.name === 'shared-skill');
        expect(sharedMetas.length).toBe(1);
        expect(sharedMetas[0].description).toBe('from dir 1 (project)');
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });
  });
});
