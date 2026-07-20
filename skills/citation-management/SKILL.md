---
name: citation-management
description: 文献引用管理技能，支持 APA/Nature/Vancouver/Chicago 多格式引用生成、BibTeX 管理和参考文献列表自动化
version: 1
lastUpdated: 2025-01-15
---

# Citation Management Skill

## 概述

本技能指导你完成科研文献引用管理任务，包括：
- 多引用格式生成（APA、Nature、Vancouver、Chicago）
- BibTeX 文件管理
- 文中引用与参考文献列表一致性检查
- 批量格式转换

## 支持的引用格式

### 1. APA 第7版

**期刊文章：**
```
Author, A. A., & Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), Pages. https://doi.org/xxx
```

**书籍：**
```
Author, A. A. (Year). Title of book (Edition). Publisher.
```

**书籍章节：**
```
Author, A. A. (Year). Title of chapter. In B. B. Editor (Ed.), Title of book (pp. xx-xx). Publisher.
```

**网页：**
```
Author, A. A. (Year, Month Day). Title of page. Site Name. https://www.example.com/page
```

### 2. Nature

**期刊文章：**
```
Author, A. A. & Author, B. B. Title of article. Journal Name Volume, Pages (Year).
```

### 3. Vancouver

**期刊文章：**
```
Author AA, Author BB. Title of article. Journal Name. Year;Volume(Issue):Pages.
```

### 4. Chicago（作者-日期制）

**期刊文章：**
```
Author, A. A., and B. B. Author. Year. "Title of article." Journal Name Volume, no. Issue: Pages.
```

## 文中引用格式

### APA
- 单作者：(Smith, 2024)
- 双作者：(Smith & Jones, 2024)
- 三作者以上：(Smith et al., 2024)
- 直接引用：(Smith, 2024, p. 15)

### Nature
- 单作者：(Smith, 2024) 或上标 1
- 多作者：Smith et al.¹ 或 (Smith et al., 2024)

### Vancouver
- 数字编号：¹, ², ³ 或 [1], [2], [3]
- 按出现顺序编号

## 使用脚本生成引用

使用 `format-citation.py` 脚本可以快速生成各格式引用：

```bash
# 生成单篇引用
python3 format-citation.py --format apa --type article \
  --authors "Smith, J.;Jones, K." --year 2024 \
  --title "CRISPR off-target effects" \
  --journal "Nature Methods" --volume 21 --issue 3 --pages "100-115" \
  --doi "10.1038/s41592-024-01234-5"

# 批量转换 BibTeX 文件
python3 format-citation.py --batch references.bib --format nature --output refs.txt
```

## BibTeX 管理

### BibTeX 条目类型

```bibtex
@article{key2024,
  author  = {Smith, John and Jones, Kate},
  title   = {CRISPR off-target effects in human cells},
  journal = {Nature Methods},
  year    = {2024},
  volume  = {21},
  number  = {3},
  pages   = {100--115},
  doi     = {10.1038/s41592-024-01234-5},
}

@book{smith2023,
  author    = {Smith, John},
  title     = {Gene Editing Technologies},
  year      = {2023},
  publisher = {Academic Press},
  edition   = {2nd},
}

@inproceedings{lee2024,
  author    = {Lee, M. and Wang, Y.},
  title     = {Deep learning for protein structure prediction},
  booktitle = {Proceedings of ICML 2024},
  year      = {2024},
  pages     = {1234--1245},
}
```

### BibTeX Key 命名规范

```
推荐格式：{第一作者姓}{年份}{标题首词}
示例：smith2024crispr, jones2023gene

注意事项：
- 全小写
- 无空格和特殊字符
- 同一作者同年加 a, b, c 后缀
```

## 参考文献一致性检查

### 检查清单

1. **文中引用 vs 参考文献列表**
   - 每个文中引用在参考文献列表中有对应条目
   - 参考文献列表中的每条在正文中被引用
   - 作者名拼写一致

2. **格式一致性**
   - 所有条目使用同一种格式
   - 标点符号一致
   - 斜体/加粗使用一致

3. **信息完整性**
   - DOI/URL（如有）
   - 卷号、期号、页码
   - 出版年份

## 常见错误

| 错误类型 | 示例 | 修正 |
|---------|------|------|
| 作者名顺序 | Smith, John (名在前) | Smith, J. (姓在前) |
| 缺少 DOI | ...Pages. | ...Pages. https://doi.org/xxx |
| et al. 用法 | (Smith, Jones, Lee, & Wang, 2024) | (Smith et al., 2024) (3人以上) |
| 年份位置 | Smith, J. Title. Journal, 21(3), 100. | Smith, J. (2024). Title. Journal, 21(3), 100. |

## 注意事项

1. 不同期刊可能有格式微调，以目标期刊作者指南为准
2. APA 7版与6版有差异（如不需要出版地）
3. 预印本引用需注明平台（arXiv, bioRxiv 等）
4. 数据集引用需包含版本号和访问日期
5. 软件引用需包含版本号和 URL
