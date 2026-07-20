# 文献检索 API 参考

## Semantic Scholar API

### 基础信息
- **Base URL**: `https://api.semanticscholar.org/graph/v1`
- **认证**: 无需 API Key（有速率限制：1 req/s）
- **格式**: JSON

### 搜索论文

```
GET /paper/search?query={query}&limit={n}&fields={fields}

参数：
- query: 搜索关键词（空格用 + 连接）
- limit: 返回数量（最大 100）
- fields: 返回字段（逗号分隔）
  可用: title, authors, year, abstract, citationCount, url, doi, venue

示例：
GET /paper/search?query=CRISPR+off-target&limit=20&fields=title,authors,year,abstract,citationCount,url
```

### 批量获取论文

```
POST /paper/batch
Content-Type: application/json

Body: {
  "ids": ["paperId1", "paperId2"],
  "fields": "title,abstract,authors,year,citationCount"
}
```

### 获取引用

```
GET /paper/{paperId}/citations?fields=title,authors,year&limit=20
```

### 获取参考文献

```
GET /paper/{paperId}/references?fields=title,authors,year&limit=20
```

### 速率限制处理

```python
import time

def search_with_retry(query, max_retries=3):
    for attempt in range(max_retries):
        response = requests.get(
            f"https://api.semanticscholar.org/graph/v1/paper/search",
            params={"query": query, "limit": 20, "fields": "title,authors,year,abstract,citationCount"}
        )
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 429:
            wait = 2 ** attempt
            print(f"Rate limited, waiting {wait}s...")
            time.sleep(wait)
        else:
            print(f"Error: {response.status_code}")
            time.sleep(1)
    return None
```

---

## arXiv API

### 基础信息
- **Base URL**: `http://export.arxiv.org/api`
- **认证**: 无需认证
- **格式**: Atom XML
- **速率限制**: 1 req/3s

### 搜索论文

```
GET /query?search_query={query}&start={n}&max_results={n}&sortBy={sort}&sortOrder={order}

参数：
- search_query: 检索式
  - 前缀: all:, ti:, abs:, au:, cat:
  - 组合: AND, OR, ANDNOT
- start: 起始位置（分页）
- max_results: 返回数量（最大 2000）
- sortBy: relevance | lastUpdatedDate | submittedDate
- sortOrder: ascending | descending

示例：
GET /query?search_query=all:CRISPR+AND+all:off-target&max_results=20&sortBy=relevance
```

### 分类代码

| 分类 | 代码 | 说明 |
|------|------|------|
| 物理 | physics | 物理学 |
| 数学 | math | 数学 |
| CS | cs | 计算机科学 |
|   | cs.AI | 人工智能 |
|   | cs.CL | 计算语言学 |
|   | cs.LG | 机器学习 |
| 生物 | q-bio | 定量生物学 |
|   | q-bio.GN | 遗传学 |

### XML 解析示例

```python
import urllib.request
import xml.etree.ElementTree as ET

def search_arxiv(query, max_results=20):
    url = f"http://export.arxiv.org/api/query?search_query=all:{query}&max_results={max_results}&sortBy=relevance"
    
    with urllib.request.urlopen(url) as response:
        xml_data = response.read()
    
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    papers = []
    for entry in root.findall('atom:entry', ns):
        paper = {
            'title': entry.find('atom:title', ns).text.strip().replace('\n', ' '),
            'summary': entry.find('atom:summary', ns).text.strip().replace('\n', ' '),
            'published': entry.find('atom:published', ns).text,
            'url': entry.find('atom:id', ns).text,
            'authors': [a.find('atom:name', ns).text for a in entry.findall('atom:author', ns)],
        }
        papers.append(paper)
    
    return papers
```

---

## PubMed API (E-utilities)

### 基础信息
- **Base URL**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils`
- **认证**: 无需（有 API Key 可提高速率到 10 req/s）
- **格式**: JSON / XML

### 搜索（esearch）

```
GET /esearch.fcgi?db=pubmed&term={query}&retmax={n}&retmode=json&sort={sort}

参数：
- db: 数据库（pubmed）
- term: 检索式
- retmax: 返回数量
- retmode: json | xml
- sort: relevance | pub_date

示例：
GET /esearch.fcgi?db=pubmed&term=CRISPR+off-target&retmax=20&retmode=json
```

### 获取摘要（efetch）

```
GET /efetch.fcgi?db=pubmed&id={PMID1,PMID2}&rettype=abstract&retmode=text

参数：
- db: pubmed
- id: PMID 列表（逗号分隔）
- rettype: abstract | medline | uilist
- retmode: text | xml
```

### 获取详情（esummary）

```
GET /esummary.fcgi?db=pubmed&id={PMID}&retmode=json
```

### MeSH 词检索

```
# 使用 MeSH 词提高查全率
term: "CRISPR-Cas Systems"[MeSH] AND "off-target"[Title/Abstract]
```

---

## Google Scholar（非官方）

> ⚠️ Google Scholar 无官方 API，以下为网页解析方法

```python
import requests
from bs4 import BeautifulSoup

def search_google_scholar(query, num=10):
    headers = {
        'User-Agent': 'Mozilla/5.0 (research-tool)',
    }
    url = f"https://scholar.google.com/scholar?q={query}&num={num}"
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    results = []
    for item in soup.select('.gs_r.gs_or.gs_scl'):
        title_elem = item.select_one('.gs_rt')
        if title_elem:
            results.append({
                'title': title_elem.get_text(),
                'url': title_elem.find('a')['href'] if title_elem.find('a') else '',
            })
    return results
```

**注意**: Google Scholar 有严格的反爬措施，建议：
1. 控制请求频率（≥10s 间隔）
2. 使用代理轮换
3. 优先使用官方 API（Semantic Scholar 等）

---

## 通用最佳实践

### 1. 速率限制
```python
import time

def rate_limited_call(func, interval=1.0, *args, **kwargs):
    """确保调用间隔不小于 interval 秒"""
    time.sleep(interval)
    return func(*args, **kwargs)
```

### 2. 错误处理
```python
import requests
from typing import Optional

def safe_get(url: str, max_retries: int = 3, timeout: int = 30) -> Optional[dict]:
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            print(f"Attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    return None
```

### 3. 结果缓存
```python
import hashlib
import json
import os

def cache_result(query: str, result: dict, cache_dir: str = '.cache'):
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.md5(query.encode()).hexdigest()
    cache_file = os.path.join(cache_dir, f"{key}.json")
    with open(cache_file, 'w') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
```
