/**
 * arXiv Search Extension
 *
 * arXiv 论文搜索工具，使用 arXiv API。
 * 支持按关键词、分类搜索学术论文。
 *
 * 导出 `tool` 对象，由 ExtensionLoader 编译并注册到 ToolRegistry。
 */

interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  pdfUrl: string;
  categories: string[];
}

interface ArxivSearchParams {
  query: string;
  maxResults?: number;
  category?: string;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
}

interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

interface ToolContext {
  workDir: string;
  sessionId: string;
}

/**
 * 解析 arXiv API 返回的 Atom XML
 * 使用 DOMParser（Node.js 20+ 内置）或正则解析
 */
function parseArxivXml(xmlText: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // 使用正则解析 XML（兼容性最好，不依赖 DOMParser）
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];

    // 提取 ID
    const idMatch = entry.match(/<id>(.*?)<\/id>/);
    const id = idMatch ? idMatch[1].trim() : '';

    // 提取标题（去除换行和多余空格）
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    // 提取作者
    const authors: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    // 提取摘要
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const abstract = summaryMatch
      ? summaryMatch[1].replace(/\s+/g, ' ').trim()
      : '';

    // 提取发布日期
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
    const published = publishedMatch ? publishedMatch[1].trim() : '';

    // 提取 PDF 链接
    const pdfMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]*)"[^>]*\/?>/);
    const pdfUrl = pdfMatch ? pdfMatch[1] : '';

    // 提取分类
    const categories: string[] = [];
    const categoryRegex = /<category[^>]*term="([^"]*)"[^>]*\/?>/g;
    let catMatch: RegExpExecArray | null;
    while ((catMatch = categoryRegex.exec(entry)) !== null) {
      categories.push(catMatch[1]);
    }

    papers.push({
      id,
      title,
      authors,
      abstract,
      published,
      pdfUrl,
      categories,
    });
  }

  return papers;
}

/**
 * 构建 arXiv 搜索查询
 */
function buildSearchQuery(query: string, category?: string): string {
  let searchQuery = `all:${encodeURIComponent(query)}`;
  if (category) {
    searchQuery += `+AND+cat:${encodeURIComponent(category)}`;
  }
  return searchQuery;
}

/**
 * 执行 arXiv 搜索
 */
async function searchArxiv(params: ArxivSearchParams): Promise<ArxivPaper[]> {
  const { query, maxResults = 5, category, sortBy = 'relevance' } = params;

  const searchQuery = buildSearchQuery(query, category);
  const url = `http://export.arxiv.org/api/query?search_query=${searchQuery}&start=0&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=descending`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Crab-Science/0.2.0 (Research Agent)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    return parseArxivXml(xmlText);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 格式化论文信息为可读文本
 */
function formatPaper(paper: ArxivPaper, index: number): string {
  const authors = paper.authors.length > 0
    ? paper.authors.slice(0, 5).join(', ') +
      (paper.authors.length > 5 ? ' et al.' : '')
    : 'Unknown';

  const date = paper.published
    ? new Date(paper.published).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'N/A';

  const categories = paper.categories.length > 0
    ? paper.categories.join(', ')
    : 'N/A';

  const abstract = paper.abstract
    ? paper.abstract.substring(0, 300) +
      (paper.abstract.length > 300 ? '...' : '')
    : 'No abstract available';

  return [
    `${index}. ${paper.title}`,
    `   Authors: ${authors}`,
    `   Published: ${date}`,
    `   Categories: ${categories}`,
    `   arXiv ID: ${paper.id}`,
    paper.pdfUrl ? `   PDF: ${paper.pdfUrl}` : '',
    `   Abstract: ${abstract}`,
  ].filter(Boolean).join('\n');
}

/**
 * 导出的工具对象
 */
export const tool = {
  name: 'arxiv-search',
  description: 'Search arXiv for academic papers. Returns structured results including title, authors, abstract, PDF link, and publication date.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query (keywords or phrases)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default 5, max 20)',
      },
      category: {
        type: 'string',
        description: 'arXiv category filter (e.g., cs.AI, physics.gen-ph, q-bio.GN)',
      },
      sortBy: {
        type: 'string',
        description: 'Sort order: relevance, lastUpdatedDate, or submittedDate',
        enum: ['relevance', 'lastUpdatedDate', 'submittedDate'],
      },
    },
    required: ['query'],
  },
  execute: async (
    params: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> => {
    const query = params.query as string;
    const maxResults = Math.min((params.maxResults as number) ?? 5, 20);
    const category = params.category as string | undefined;
    const sortBy = (params.sortBy as 'relevance' | 'lastUpdatedDate' | 'submittedDate') || 'relevance';

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        output: '',
        error: 'Search query cannot be empty',
      };
    }

    try {
      const papers = await searchArxiv({
        query,
        maxResults,
        category,
        sortBy,
      });

      if (papers.length === 0) {
        return {
          success: true,
          output: `No arXiv papers found for "${query}"${category ? ` in category ${category}` : ''}.`,
        };
      }

      const formatted = papers.map((p, i) => formatPaper(p, i + 1)).join('\n\n');

      return {
        success: true,
        output: `arXiv search results for "${query}" (${papers.length} papers found):\n\n${formatted}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: `arXiv search failed: ${message}`,
      };
    }
  },
};
