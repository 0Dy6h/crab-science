#!/usr/bin/env python3
"""
多数据库文献检索工具

支持数据库：
1. Semantic Scholar API
2. arXiv API
3. PubMed E-utilities

用法:
    # Semantic Scholar 检索
    python3 search.py --db semantic-scholar --query "CRISPR off-target" --max 20

    # arXiv 检索
    python3 search.py --db arxiv --query "deep learning protein structure" --max 20

    # PubMed 检索
    python3 search.py --db pubmed --query "CRISPR off-target" --max 20

    # 多数据库同时检索
    python3 search.py --db all --query "CRISPR off-target" --max 10 --output results.json
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional


# ============================================================
# Semantic Scholar
# ============================================================

def search_semantic_scholar(query: str, max_results: int = 20) -> List[Dict]:
    """搜索 Semantic Scholar"""
    base_url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = urllib.parse.urlencode({
        'query': query,
        'limit': min(max_results, 100),
        'fields': 'title,authors,year,abstract,citationCount,url,doi,venue',
    })
    url = f"{base_url}?{params}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Crab-Science/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        papers = []
        for item in data.get('data', []):
            authors = ', '.join(
                a.get('name', '') for a in item.get('authors', [])[:5]
            )
            if len(item.get('authors', [])) > 5:
                authors += ' et al.'

            papers.append({
                'source': 'semantic-scholar',
                'title': item.get('title', ''),
                'authors': authors,
                'year': item.get('year'),
                'abstract': (item.get('abstract') or '')[:300],
                'citations': item.get('citationCount', 0),
                'url': item.get('url', ''),
                'doi': item.get('doi', ''),
                'venue': item.get('venue', ''),
            })

        return papers

    except Exception as e:
        print(f"Semantic Scholar 检索失败: {e}", file=sys.stderr)
        return []


# ============================================================
# arXiv
# ============================================================

def search_arxiv(query: str, max_results: int = 20) -> List[Dict]:
    """搜索 arXiv"""
    base_url = "http://export.arxiv.org/api/query"
    params = urllib.parse.urlencode({
        'search_query': f'all:{query}',
        'max_results': max_results,
        'sortBy': 'relevance',
        'sortOrder': 'descending',
    })
    url = f"{base_url}?{params}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Crab-Science/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            xml_data = response.read().decode('utf-8')

        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}

        papers = []
        for entry in root.findall('atom:entry', ns):
            title = entry.find('atom:title', ns)
            summary = entry.find('atom:summary', ns)
            published = entry.find('atom:published', ns)
            link = entry.find('atom:id', ns)

            authors = []
            for author in entry.findall('atom:author', ns):
                name = author.find('atom:name', ns)
                if name is not None:
                    authors.append(name.text)
            author_str = ', '.join(authors[:5])
            if len(authors) > 5:
                author_str += ' et al.'

            year = None
            if published is not None and published.text:
                year = int(published.text[:4])

            papers.append({
                'source': 'arxiv',
                'title': (title.text or '').strip().replace('\n', ' ') if title is not None else '',
                'authors': author_str,
                'year': year,
                'abstract': (summary.text or '').strip().replace('\n', ' ')[:300] if summary is not None else '',
                'citations': 0,  # arXiv 不提供引用数
                'url': link.text if link is not None else '',
                'doi': '',
                'venue': 'arXiv',
            })

        return papers

    except Exception as e:
        print(f"arXiv 检索失败: {e}", file=sys.stderr)
        return []


# ============================================================
# PubMed
# ============================================================

def search_pubmed(query: str, max_results: int = 20) -> List[Dict]:
    """搜索 PubMed"""
    # Step 1: esearch 获取 PMID 列表
    esearch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    params = urllib.parse.urlencode({
        'db': 'pubmed',
        'term': query,
        'retmax': max_results,
        'retmode': 'json',
        'sort': 'relevance',
    })
    url = f"{esearch_url}?{params}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Crab-Science/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        id_list = data.get('esearchresult', {}).get('idlist', [])
        if not id_list:
            return []

        # Step 2: esummary 获取详情
        time.sleep(0.5)  # 速率限制
        esummary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        params = urllib.parse.urlencode({
            'db': 'pubmed',
            'id': ','.join(id_list),
            'retmode': 'json',
        })
        url = f"{esummary_url}?{params}"

        req = urllib.request.Request(url, headers={'User-Agent': 'Crab-Science/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))

        papers = []
        result = data.get('result', {})
        for pmid in id_list:
            item = result.get(pmid, {})
            authors = ', '.join(
                a.get('name', '') for a in item.get('authors', [])[:5]
            )
            if len(item.get('authors', [])) > 5:
                authors += ' et al.'

            papers.append({
                'source': 'pubmed',
                'title': item.get('title', ''),
                'authors': authors,
                'year': int(item.get('pubdate', '0')[:4]) if item.get('pubdate', '')[:4].isdigit() else None,
                'abstract': '',  # esummary 不返回摘要，需 efetch
                'citations': 0,
                'url': f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                'doi': '',
                'venue': item.get('fulljournalname', item.get('source', '')),
                'pmid': pmid,
            })

        return papers

    except Exception as e:
        print(f"PubMed 检索失败: {e}", file=sys.stderr)
        return []


# ============================================================
# 多数据库检索
# ============================================================

def search_all(query: str, max_results: int = 10) -> List[Dict]:
    """同时搜索多个数据库"""
    all_results = []

    # Semantic Scholar
    print("检索 Semantic Scholar...", file=sys.stderr)
    results = search_semantic_scholar(query, max_results)
    all_results.extend(results)
    time.sleep(1)  # 速率限制

    # arXiv
    print("检索 arXiv...", file=sys.stderr)
    results = search_arxiv(query, max_results)
    all_results.extend(results)
    time.sleep(1)

    # PubMed
    print("检索 PubMed...", file=sys.stderr)
    results = search_pubmed(query, max_results)
    all_results.extend(results)

    return all_results


# ============================================================
# 输出格式化
# ============================================================

def format_results(papers: List[Dict], format_type: str = 'text') -> str:
    """格式化输出结果"""
    if format_type == 'json':
        return json.dumps(papers, ensure_ascii=False, indent=2)

    lines = [f'检索结果（{len(papers)} 篇）:', '=' * 60]
    for i, paper in enumerate(papers, 1):
        lines.append(f'\n[{i}] {paper.get("title", "无标题")}')
        lines.append(f'    来源: {paper.get("source", "")}')
        lines.append(f'    作者: {paper.get("authors", "")}')
        if paper.get('year'):
            lines.append(f'    年份: {paper["year"]}')
        if paper.get('venue'):
            lines.append(f'    期刊: {paper["venue"]}')
        if paper.get('citations'):
            lines.append(f'    引用: {paper["citations"]}')
        if paper.get('doi'):
            lines.append(f'    DOI: {paper["doi"]}')
        if paper.get('url'):
            lines.append(f'    URL: {paper["url"]}')
        if paper.get('abstract'):
            lines.append(f'    摘要: {paper["abstract"][:200]}...')

    return '\n'.join(lines)


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='多数据库文献检索工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument('--db', '-d',
                        choices=['semantic-scholar', 'arxiv', 'pubmed', 'all'],
                        default='all',
                        help='数据库（默认 all）')
    parser.add_argument('--query', '-q', required=True, help='检索关键词')
    parser.add_argument('--max', '-m', type=int, default=20, help='每个数据库最大返回数（默认20）')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--format', '-f',
                        choices=['text', 'json'],
                        default='text',
                        help='输出格式（默认 text）')

    args = parser.parse_args()

    # 执行检索
    if args.db == 'all':
        papers = search_all(args.query, args.max)
    elif args.db == 'semantic-scholar':
        papers = search_semantic_scholar(args.query, args.max)
    elif args.db == 'arxiv':
        papers = search_arxiv(args.query, args.max)
    elif args.db == 'pubmed':
        papers = search_pubmed(args.query, args.max)
    else:
        print(f'未知数据库: {args.db}', file=sys.stderr)
        sys.exit(1)

    # 输出
    output = format_results(papers, args.format)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f'结果已保存到 {args.output}（{len(papers)} 篇）', file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
