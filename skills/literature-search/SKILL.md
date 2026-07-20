---
name: literature-search
description: 科研文献检索技能，支持多数据库（Semantic Scholar、arXiv、PubMed）检索、去重、排序和综述生成
version: 1
lastUpdated: 2025-01-15
---

# Literature Search Skill

## 概述

本技能指导你完成科研文献检索任务，包括：
- 多数据库检索（Semantic Scholar、arXiv、PubMed）
- 结果去重与排序
- 文献摘要提取
- 文献综述生成

## 检索策略

### 1. 关键词规划

根据用户需求，提取核心关键词和同义词：
- 主题词 + 同义词 + 缩写
- 英文关键词优先（覆盖面广）
- 考虑 MeSH 术语（PubMed）

### 2. Semantic Scholar API

```bash
# 搜索论文（返回 JSON）
curl -s "https://api.semanticscholar.org/graph/v1/paper/search?query=CRISPR+off-target&limit=20&fields=title,authors,year,abstract,citationCount,url" | python3 -m json.tool

# 批量获取论文详情
curl -s "https://api.semanticscholar.org/graph/v1/paper/batch" \
  -X POST -H "Content-Type: application/json" \
  -d '{"ids":["paperId1","paperId2"],"fields":"title,abstract,authors,year,citationCount"}'
```

### 3. arXiv API

```bash
# 搜索 arXiv 论文
curl -s "http://export.arxiv.org/api/query?search_query=all:CRISPR+off-target&max_results=20&sortBy=relevance" | python3 -c "
import sys, xml.etree.ElementTree as ET
tree = ET.parse(sys.stdin)
ns = {'atom': 'http://www.w3.org/2005/Atom'}
for entry in tree.findall('.//atom:entry', ns):
    title = entry.find('atom:title', ns).text.strip()
    summary = entry.find('atom:summary', ns).text.strip()
    print(f'Title: {title}')
    print(f'Summary: {summary[:200]}...')
    print('---')
"
```

### 4. PubMed API (E-utilities)

```bash
# 搜索 PubMed
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=CRISPR+off-target&retmax=20&retmode=json" | python3 -m json.tool

# 获取摘要
curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=PMID1,PMID2&rettype=abstract&retmode=text"
```

## 去重与排序

1. **去重**：按标题（归一化后）+ DOI 去重
2. **排序**：按引用数降序 + 年份降序
3. **筛选**：根据用户需求筛选 Top N

```python
# 去重排序脚本模板
import json

papers = [...]  # 检索结果

# 按标题去重
seen = set()
unique = []
for p in papers:
    key = p.get('title', '').lower().strip()
    if key not in seen:
        seen.add(key)
        unique.append(p)

# 按引用数 + 年份排序
unique.sort(key=lambda x: (x.get('citationCount', 0), x.get('year', 0)), reverse=True)

# 输出 Top N
for p in unique[:5]:
    print(f"**{p['title']}** ({p.get('year', 'N/A')})")
    authors = ', '.join(a.get('name', '') for a in p.get('authors', [])[:3])
    print(f"  作者: {authors}")
    print(f"  引用: {p.get('citationCount', 0)}")
    print(f"  摘要: {p.get('abstract', 'N/A')[:200]}...")
    print()
```

## 综述生成模板

将检索结果整理为结构化综述：

```markdown
# 文献综述：{主题}

## 检索策略
- 数据库：Semantic Scholar, arXiv, PubMed
- 关键词：{keywords}
- 检索时间：{date}
- 检索结果：{total} 篇，筛选 {n} 篇

## 重要文献

### 1. {title} ({year})
- **作者**: {authors}
- **引用数**: {citations}
- **摘要**: {abstract}
- **关键发现**: {key_findings}

### 2. ...

## 研究趋势
- {trend_observations}

## 建议进一步阅读
- {recommendations}
```

## 注意事项

1. API 可能有速率限制，每次请求间隔 1 秒
2. Semantic Scholar API 限制：每秒 1 请求（无 key）
3. 检索结果保存为 JSON 或 Markdown 文件供后续分析
4. 对于中文文献，可考虑使用 CNKI 或万方数据（需手动检索）
