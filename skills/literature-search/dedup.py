#!/usr/bin/env python3
"""
文献去重与排序工具

功能：
1. 按标题归一化去重
2. 按 DOI 去重
3. 按引用数 + 年份排序
4. 合并多个来源的检索结果

用法:
    # 合并多个 JSON 文件并去重
    python3 dedup.py --input results1.json results2.json --output deduplicated.json

    # 从 JSON 数据去重（stdin）
    cat results.json | python3 dedup.py --stdin --output dedup.json

    # 指定排序方式
    python3 dedup.py --input results.json --sort citations --top 20 --output top20.json
"""

import argparse
import json
import re
import sys
from typing import List, Dict, Set, Optional


# ============================================================
# 标题归一化
# ============================================================

def normalize_title(title: str) -> str:
    """
    归一化标题用于去重比较
    - 转小写
    - 移除标点符号
    - 移除多余空格
    - 移除常见前缀/后缀
    """
    if not title:
        return ''

    # 转小写
    t = title.lower().strip()

    # 移除 HTML 标签
    t = re.sub(r'<[^>]+>', '', t)

    # 移除标点符号
    t = re.sub(r'[^\w\s]', ' ', t)

    # 移除常见前缀
    prefixes = [
        'a ', 'an ', 'the ',
        'research on ', 'study on ', 'studies on ',
        'research of ', 'study of ',
    ]
    for prefix in prefixes:
        if t.startswith(prefix):
            t = t[len(prefix):]

    # 合并多余空格
    t = re.sub(r'\s+', ' ', t).strip()

    return t


def normalize_doi(doi: str) -> str:
    """归一化 DOI"""
    if not doi:
        return ''
    d = doi.lower().strip()
    # 移除 URL 前缀
    d = re.sub(r'^https?://(dx\.)?doi\.org/', '', d)
    return d


def normalize_authors(authors: str) -> str:
    """归一化作者名"""
    if not authors:
        return ''
    # 移除 "et al." 等
    a = re.sub(r'et al\.?', '', authors, flags=re.IGNORECASE)
    # 提取姓氏
    names = []
    for name in re.split(r'[;,]', a):
        name = name.strip().lower()
        if name:
            # 取最后一个词作为姓
            parts = name.split()
            if parts:
                names.append(parts[-1])
    return ' '.join(sorted(names))


# ============================================================
# 去重
# ============================================================

def deduplicate(papers: List[Dict]) -> List[Dict]:
    """
    多策略去重：
    1. DOI 精确去重
    2. 标题归一化 + 作者匹配去重
    3. 标题归一化单独去重（高相似度）
    """
    seen_dois: Set[str] = set()
    seen_titles: Dict[str, Dict] = {}  # normalized_title -> paper
    seen_title_authors: Set[str] = set()
    unique: List[Dict] = []

    for paper in papers:
        # 策略 1: DOI 去重
        doi = normalize_doi(paper.get('doi', ''))
        if doi:
            if doi in seen_dois:
                # 合并信息（保留引用数较高的）
                existing = next((p for p in unique if normalize_doi(p.get('doi', '')) == doi), None)
                if existing:
                    _merge_paper(existing, paper)
                continue
            seen_dois.add(doi)

        # 策略 2: 标题 + 作者去重
        norm_title = normalize_title(paper.get('title', ''))
        norm_authors = normalize_authors(paper.get('authors', ''))
        title_author_key = f'{norm_title}|{norm_authors}'

        if norm_title and title_author_key in seen_title_authors:
            existing = next(
                (p for p in unique if normalize_title(p.get('title', '')) == norm_title),
                None,
            )
            if existing:
                _merge_paper(existing, paper)
            continue

        if norm_title and title_author_key:
            seen_title_authors.add(title_author_key)

        # 策略 3: 仅标题去重（高相似度）
        if norm_title and norm_title in seen_titles:
            existing = seen_titles[norm_title]
            # 只在作者也匹配时才去重
            existing_authors = normalize_authors(existing.get('authors', ''))
            if not norm_authors or not existing_authors or _authors_similar(norm_authors, existing_authors):
                _merge_paper(existing, paper)
                continue

        # 通过所有去重检查
        if norm_title:
            seen_titles[norm_title] = paper
        unique.append(paper)

    return unique


def _merge_paper(existing: Dict, new: Dict) -> None:
    """合并两篇论文信息（保留更完整的）"""
    # 保留较高的引用数
    if new.get('citations', 0) > existing.get('citations', 0):
        existing['citations'] = new['citations']
    # 补充缺失的字段
    for key in ['abstract', 'doi', 'url', 'venue', 'year']:
        if not existing.get(key) and new.get(key):
            existing[key] = new[key]
    # 记录来源
    sources = existing.get('_sources', [existing.get('source', '')])
    if new.get('source') and new['source'] not in sources:
        sources.append(new['source'])
    existing['_sources'] = sources


def _authors_similar(a1: str, a2: str, threshold: float = 0.5) -> bool:
    """判断两个作者列表是否相似（Jaccard 相似度）"""
    if not a1 or not a2:
        return True  # 缺失作者时不过滤
    set1 = set(a1.split())
    set2 = set(a2.split())
    intersection = set1 & set2
    union = set1 | set2
    if not union:
        return True
    return len(intersection) / len(union) >= threshold


# ============================================================
# 排序
# ============================================================

def sort_papers(papers: List[Dict], sort_by: str = 'relevance') -> List[Dict]:
    """排序论文"""
    if sort_by == 'citations':
        return sorted(papers, key=lambda p: (p.get('citations', 0), p.get('year', 0) or 0), reverse=True)
    elif sort_by == 'year':
        return sorted(papers, key=lambda p: p.get('year', 0) or 0, reverse=True)
    elif sort_by == 'title':
        return sorted(papers, key=lambda p: p.get('title', '').lower())
    elif sort_by == 'relevance':
        # 默认：引用数 * 0.7 + 年份近度 * 0.3
        import datetime
        current_year = datetime.datetime.now().year
        return sorted(
            papers,
            key=lambda p: (
                p.get('citations', 0) * 0.7
                + max(0, (current_year - (p.get('year', current_year) or current_year))) * -0.3
            ),
            reverse=True,
        )
    return papers


# ============================================================
# 统计
# ============================================================

def print_stats(papers: List[Dict], original_count: int) -> None:
    """打印去重统计"""
    deduped_count = len(papers)
    removed = original_count - deduped_count

    # 按来源统计
    source_counts: Dict[str, int] = {}
    for p in papers:
        source = p.get('source', 'unknown')
        source_counts[source] = source_counts.get(source, 0) + 1

    print(f'去重统计:', file=sys.stderr)
    print(f'  原始: {original_count} 篇', file=sys.stderr)
    print(f'  去重后: {deduped_count} 篇', file=sys.stderr)
    print(f'  移除: {removed} 篇 ({removed/original_count*100:.1f}%)', file=sys.stderr)
    print(f'  来源分布:', file=sys.stderr)
    for source, count in sorted(source_counts.items()):
        print(f'    {source}: {count} 篇', file=sys.stderr)


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='文献去重与排序工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument('--input', '-i', nargs='+', help='输入 JSON 文件路径（多个）')
    parser.add_argument('--stdin', action='store_true', help='从 stdin 读取 JSON')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--format', '-f',
                        choices=['json', 'text'],
                        default='json',
                        help='输出格式（默认 json）')
    parser.add_argument('--sort', '-s',
                        choices=['relevance', 'citations', 'year', 'title'],
                        default='relevance',
                        help='排序方式（默认 relevance）')
    parser.add_argument('--top', '-t', type=int, help='只保留 Top N')

    args = parser.parse_args()

    # 读取输入
    all_papers: List[Dict] = []

    if args.stdin:
        data = json.load(sys.stdin)
        if isinstance(data, list):
            all_papers = data
        elif isinstance(data, dict) and 'papers' in data:
            all_papers = data['papers']
    elif args.input:
        for filepath in args.input:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, list):
                    all_papers.extend(data)
                elif isinstance(data, dict) and 'papers' in data:
                    all_papers.extend(data['papers'])
            except FileNotFoundError:
                print(f'文件不存在: {filepath}', file=sys.stderr)
            except json.JSONDecodeError:
                print(f'JSON 解析失败: {filepath}', file=sys.stderr)
    else:
        parser.error('请提供 --input 或 --stdin')

    if not all_papers:
        print('无输入数据', file=sys.stderr)
        sys.exit(1)

    original_count = len(all_papers)

    # 去重
    deduped = deduplicate(all_papers)

    # 排序
    sorted_papers = sort_papers(deduped, args.sort)

    # Top N
    if args.top and args.top > 0:
        sorted_papers = sorted_papers[:args.top]

    # 统计
    print_stats(sorted_papers, original_count)

    # 输出
    if args.format == 'json':
        output = json.dumps(sorted_papers, ensure_ascii=False, indent=2)
    else:
        lines = [f'去重排序结果（{len(sorted_papers)} 篇）:', '=' * 60]
        for i, paper in enumerate(sorted_papers, 1):
            lines.append(f'\n[{i}] {paper.get("title", "无标题")}')
            lines.append(f'    作者: {paper.get("authors", "")}')
            if paper.get('year'):
                lines.append(f'    年份: {paper["year"]}')
            if paper.get('citations'):
                lines.append(f'    引用: {paper["citations"]}')
            if paper.get('source'):
                lines.append(f'    来源: {paper["source"]}')
        output = '\n'.join(lines)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f'结果已保存到 {args.output}', file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
