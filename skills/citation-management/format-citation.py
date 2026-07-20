#!/usr/bin/env python3
"""
文献引用格式化工具

支持格式：APA 7th, Nature, Vancouver, Chicago (Author-Date)
支持类型：article, book, bookchapter, web

用法:
    # 生成单篇引用
    python3 format-citation.py --format apa --type article \
        --authors "Smith, J.;Jones, K." --year 2024 \
        --title "CRISPR off-target effects" \
        --journal "Nature Methods" --volume 21 --issue 3 --pages "100-115"

    # 批量转换 BibTeX
    python3 format-citation.py --batch references.bib --format nature --output refs.txt
"""

import argparse
import re
import sys
from typing import List, Dict, Optional


# ============================================================
# 作者名解析与格式化
# ============================================================

def parse_authors(authors_str: str) -> List[Dict[str, str]]:
    """
    解析作者字符串为结构化列表

    输入格式: "Smith, J.;Jones, K.;Lee, M."
    返回: [{'last': 'Smith', 'first': 'J.'}, ...]
    """
    authors = []
    for raw in authors_str.split(';'):
        raw = raw.strip()
        if not raw:
            continue
        if ',' in raw:
            parts = raw.split(',', 1)
            last = parts[0].strip()
            first = parts[1].strip()
        else:
            # "John Smith" 格式
            parts = raw.rsplit(' ', 1)
            if len(parts) == 2:
                first, last = parts[0].strip(), parts[1].strip()
            else:
                last, first = raw, ''

        # 缩写名字
        first_initials = '. '.join(
            f'{name[0].upper()}.' for name in first.split() if name
        )
        authors.append({
            'last': last,
            'first': first_initials,
            'full': f'{last}, {first_initials}' if first_initials else last,
        })
    return authors


def format_authors_apa(authors: List[Dict[str, str]]) -> str:
    """APA 7 格式化作者列表"""
    if not authors:
        return ''
    if len(authors) == 1:
        return authors[0]['full']
    if len(authors) == 2:
        return f"{authors[0]['full']} & {authors[1]['full']}"
    if len(authors) <= 20:
        parts = [a['full'] for a in authors[:-1]]
        return ', '.join(parts) + f', & {authors[-1]["full"]}'
    # 超过20个作者
    parts = [a['full'] for a in authors[:19]]
    return ', '.join(parts) + f'... {authors[-1]["full"]}'


def format_authors_nature(authors: List[Dict[str, str]]) -> str:
    """Nature 格式化作者列表"""
    if not authors:
        return ''
    if len(authors) == 1:
        return f"{authors[0]['last']}"
    if len(authors) <= 5:
        parts = [a['last'] for a in authors[:-1]]
        return ', '.join(parts) + f' & {authors[-1]["last"]}'
    return f"{authors[0]['last']} et al."


def format_authors_vancouver(authors: List[Dict[str, str]]) -> str:
    """Vancouver 格式化作者列表"""
    if not authors:
        return ''
    formatted = []
    for a in authors[:6]:
        # Vancouver: Smith AA (姓 + 名首字母无点)
        initials = a['first'].replace('.', '').replace(' ', '')
        formatted.append(f"{a['last']} {initials}")
    if len(authors) > 6:
        formatted.append('et al')
    return ', '.join(formatted)


def format_authors_chicago(authors: List[Dict[str, str]]) -> str:
    """Chicago (Author-Date) 格式化作者列表"""
    if not authors:
        return ''
    if len(authors) == 1:
        return f"{authors[0]['last']}, {authors[0]['first']}"
    if len(authors) <= 3:
        parts = [f"{a['last']}, {a['first']}" for a in authors[:-1]]
        return ', '.join(parts) + f', and {authors[-1]["last"]}, {authors[-1]["first"]}'
    return f"{authors[0]['last']}, {authors[0]['first']} et al."


# ============================================================
# 引用格式生成器
# ============================================================

def format_apa(entry: Dict) -> str:
    """生成 APA 7 格式引用"""
    authors = entry.get('authors', [])
    author_str = format_authors_apa(authors)
    year = entry.get('year', 'n.d.')
    title = entry.get('title', '')
    entry_type = entry.get('type', 'article')

    if entry_type == 'article':
        journal = entry.get('journal', '')
        volume = entry.get('volume', '')
        issue = entry.get('issue', '')
        pages = entry.get('pages', '')
        doi = entry.get('doi', '')

        ref = f"{author_str} ({year}). {title}. *{journal}*"
        if volume:
            ref += f", *{volume}*"
            if issue:
                ref += f"({issue})"
        if pages:
            ref += f", {pages}"
        ref += "."
        if doi:
            ref += f" https://doi.org/{doi}"
        return ref

    elif entry_type == 'book':
        publisher = entry.get('publisher', '')
        edition = entry.get('edition', '')
        ref = f"{author_str} ({year}). *{title}*"
        if edition:
            ref += f" ({edition} ed.)"
        ref += f". {publisher}."
        return ref

    elif entry_type == 'bookchapter':
        editor = entry.get('editor', '')
        book_title = entry.get('booktitle', '')
        publisher = entry.get('publisher', '')
        pages = entry.get('pages', '')
        ref = f"{author_str} ({year}). {title}. "
        if editor:
            ref += f"In {editor} (Ed.), "
        ref += f"*{book_title}*"
        if pages:
            ref += f" (pp. {pages})"
        ref += f". {publisher}."
        return ref

    elif entry_type == 'web':
        site = entry.get('site', '')
        url = entry.get('url', '')
        ref = f"{author_str} ({year}). {title}. {site}."
        if url:
            ref += f" {url}"
        return ref

    return f"{author_str} ({year}). {title}."


def format_nature(entry: Dict) -> str:
    """生成 Nature 格式引用"""
    authors = entry.get('authors', [])
    author_str = format_authors_nature(authors)
    year = entry.get('year', 'n.d.')
    title = entry.get('title', '')
    entry_type = entry.get('type', 'article')

    if entry_type == 'article':
        journal = entry.get('journal', '')
        volume = entry.get('volume', '')
        pages = entry.get('pages', '')
        ref = f"{author_str} {title}. *{journal}*"
        if volume:
            ref += f" **{volume}**"
        if pages:
            ref += f", {pages}"
        ref += f" ({year})."
        return ref

    elif entry_type == 'book':
        publisher = entry.get('publisher', '')
        ref = f"{author_str} *{title}*. {publisher} ({year})."
        return ref

    return f"{author_str} {title}. ({year})."


def format_vancouver(entry: Dict) -> str:
    """生成 Vancouver 格式引用"""
    authors = entry.get('authors', [])
    author_str = format_authors_vancouver(authors)
    year = entry.get('year', 'n.d.')
    title = entry.get('title', '')
    entry_type = entry.get('type', 'article')

    if entry_type == 'article':
        journal = entry.get('journal', '')
        volume = entry.get('volume', '')
        issue = entry.get('issue', '')
        pages = entry.get('pages', '')
        ref = f"{author_str} {title}. {journal}. {year}"
        if volume:
            ref += f";{volume}"
            if issue:
                ref += f"({issue})"
        if pages:
            ref += f":{pages}"
        ref += "."
        return ref

    elif entry_type == 'book':
        publisher = entry.get('publisher', '')
        edition = entry.get('edition', '')
        ref = f"{author_str} {title}."
        if edition:
            ref += f" {edition} ed."
        ref += f" {publisher}; {year}."
        return ref

    return f"{author_str} {title}. {year}."


def format_chicago(entry: Dict) -> str:
    """生成 Chicago (Author-Date) 格式引用"""
    authors = entry.get('authors', [])
    author_str = format_authors_chicago(authors)
    year = entry.get('year', 'n.d.')
    title = entry.get('title', '')
    entry_type = entry.get('type', 'article')

    if entry_type == 'article':
        journal = entry.get('journal', '')
        volume = entry.get('volume', '')
        issue = entry.get('issue', '')
        pages = entry.get('pages', '')
        ref = f"{author_str} {year}. \"{title}\" *{journal}*"
        if volume:
            ref += f" {volume}"
            if issue:
                ref += f", no. {issue}"
        if pages:
            ref += f": {pages}"
        ref += "."
        return ref

    elif entry_type == 'book':
        publisher = entry.get('publisher', '')
        ref = f"{author_str} {year}. *{title}*. {publisher}."
        return ref

    return f"{author_str} {year}. \"{title}\"."


# ============================================================
# BibTeX 解析
# ============================================================

def parse_bibtex(content: str) -> List[Dict]:
    """解析 BibTeX 文件内容"""
    entries = []
    # 匹配 @type{key, fields}
    pattern = r'@(\w+)\s*\{([^,]+),\s*(.*?)\n\}'
    matches = re.findall(pattern, content, re.DOTALL)

    for entry_type, key, fields_str in matches:
        entry = {'key': key.strip(), 'type': _bibtex_to_type(entry_type)}

        # 解析字段
        field_pattern = r'(\w+)\s*=\s*\{([^}]*)\}'
        for field, value in re.findall(field_pattern, fields_str):
            field = field.lower()
            value = value.strip()

            if field == 'author':
                entry['authors'] = parse_authors(value.replace(' and ', ';'))
            elif field == 'year':
                entry['year'] = value
            elif field == 'title':
                entry['title'] = value
            elif field == 'journal':
                entry['journal'] = value
            elif field == 'volume':
                entry['volume'] = value
            elif field == 'number':
                entry['issue'] = value
            elif field == 'pages':
                entry['pages'] = value.replace('--', '-')
            elif field == 'doi':
                entry['doi'] = value
            elif field == 'publisher':
                entry['publisher'] = value
            elif field == 'booktitle':
                entry['booktitle'] = value
            elif field == 'edition':
                entry['edition'] = value

        entries.append(entry)

    return entries


def _bibtex_to_type(bib_type: str) -> str:
    """BibTeX 类型转内部类型"""
    mapping = {
        'article': 'article',
        'book': 'book',
        'inbook': 'bookchapter',
        'incollection': 'bookchapter',
        'inproceedings': 'bookchapter',
        'online': 'web',
        'misc': 'article',
    }
    return mapping.get(bib_type.lower(), 'article')


# ============================================================
# 主函数
# ============================================================

FORMATTERS = {
    'apa': format_apa,
    'nature': format_nature,
    'vancouver': format_vancouver,
    'chicago': format_chicago,
}


def main():
    parser = argparse.ArgumentParser(
        description='文献引用格式化工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument('--format', '-f',
                        choices=['apa', 'nature', 'vancouver', 'chicago'],
                        default='apa',
                        help='引用格式（默认 APA）')
    parser.add_argument('--type', '-t',
                        choices=['article', 'book', 'bookchapter', 'web'],
                        default='article',
                        help='文献类型（默认 article）')
    parser.add_argument('--authors', '-a', help='作者列表（分号分隔）')
    parser.add_argument('--year', '-y', help='出版年份')
    parser.add_argument('--title', help='标题')
    parser.add_argument('--journal', help='期刊名')
    parser.add_argument('--volume', '-v', help='卷号')
    parser.add_argument('--issue', '-i', help='期号')
    parser.add_argument('--pages', '-p', help='页码')
    parser.add_argument('--doi', help='DOI')
    parser.add_argument('--publisher', help='出版社')
    parser.add_argument('--booktitle', help='书名（书籍章节）')
    parser.add_argument('--editor', help='编者')
    parser.add_argument('--edition', help='版次')
    parser.add_argument('--url', help='URL')
    parser.add_argument('--site', help='网站名')

    # 批量模式
    parser.add_argument('--batch', '-b', help='批量处理 BibTeX 文件')
    parser.add_argument('--output', '-o', help='输出文件路径')

    args = parser.parse_args()

    if args.batch:
        # 批量模式
        try:
            with open(args.batch, 'r', encoding='utf-8') as f:
                content = f.read()
            entries = parse_bibtex(content)

            formatter = FORMATTERS[args.format]
            results = []
            results.append(f'# 参考文献 ({args.format.upper()} 格式)\n')
            for i, entry in enumerate(entries, 1):
                ref = formatter(entry)
                if args.format == 'vancouver':
                    results.append(f'{i}. {ref}')
                else:
                    results.append(f'{i}. {ref}')
                results.append('')

            output = '\n'.join(results)
            if args.output:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(output)
                print(f'已生成 {len(entries)} 条引用 → {args.output}')
            else:
                print(output)
        except FileNotFoundError:
            print(f'文件不存在: {args.batch}', file=sys.stderr)
            sys.exit(1)
    else:
        # 单条模式
        if not args.authors or not args.year or not args.title:
            parser.error('单条模式需要 --authors, --year, --title 参数')

        entry = {
            'type': args.type,
            'authors': parse_authors(args.authors),
            'year': args.year,
            'title': args.title,
            'journal': args.journal,
            'volume': args.volume,
            'issue': args.issue,
            'pages': args.pages,
            'doi': args.doi,
            'publisher': args.publisher,
            'booktitle': args.booktitle,
            'editor': args.editor,
            'edition': args.edition,
            'url': args.url,
            'site': args.site,
        }

        formatter = FORMATTERS[args.format]
        print(formatter(entry))


if __name__ == '__main__':
    main()
