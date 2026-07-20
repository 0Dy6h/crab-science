/**
 * Web Search Extension
 *
 * 网络搜索工具，使用 DuckDuckGo Instant Answer API。
 * 支持代理（通过 HTTPS_PROXY 环境变量配置）。
 *
 * 导出 `tool` 对象，由 ExtensionLoader 编译并注册到 ToolRegistry。
 */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface WebSearchParams {
  query: string;
  maxResults?: number;
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
 * 获取代理配置（从环境变量）
 */
function getProxyConfig(): { proxy?: string } {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  return { proxy: httpsProxy || httpProxy };
}

/**
 * 执行网络搜索
 * 使用 DuckDuckGo Instant Answer API（无需 API Key）
 */
async function searchWeb(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

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

    const data = (await response.json()) as Record<string, unknown>;
    const results: SearchResult[] = [];

    // DuckDuckGo Instant Answer API 返回结构
    // 主结果
    if (data.Heading && data.AbstractText) {
      results.push({
        title: data.Heading as string,
        url: (data.AbstractURL as string) || '',
        snippet: data.AbstractText as string,
      });
    }

    // 相关主题
    const relatedTopics = (data.RelatedTopics as Array<Record<string, unknown>>) || [];
    for (const topic of relatedTopics) {
      if (results.length >= maxResults) break;

      if (topic.Text && topic.FirstURL) {
        results.push({
          title: (topic.Text as string).split(' - ')[0] || (topic.Text as string).substring(0, 80),
          url: topic.FirstURL as string,
          snippet: topic.Text as string,
        });
      } else if (Array.isArray(topic.Topics)) {
        // 嵌套话题
        for (const subTopic of topic.Topics as Array<Record<string, unknown>>) {
          if (results.length >= maxResults) break;
          if (subTopic.Text && subTopic.FirstURL) {
            results.push({
              title: (subTopic.Text as string).split(' - ')[0] || (subTopic.Text as string).substring(0, 80),
              url: subTopic.FirstURL as string,
              snippet: subTopic.Text as string,
            });
          }
        }
      }
    }

    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 导出的工具对象
 */
export const tool = {
  name: 'web-search',
  description: 'Search the web for current information using DuckDuckGo. Returns structured results with title, URL, and snippet.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 5, max 10)',
      },
    },
    required: ['query'],
  },
  execute: async (
    params: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> => {
    const query = params.query as string;
    const maxResults = Math.min((params.maxResults as number) ?? 5, 10);

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        output: '',
        error: 'Search query cannot be empty',
      };
    }

    // 检查代理配置（仅用于提示，fetch 自动读取环境变量）
    const { proxy } = getProxyConfig();

    try {
      const results = await searchWeb(query, maxResults);

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for "${query}". ${proxy ? '(Using proxy)' : ''}`,
        };
      }

      const formatted = results.map((r, i) => {
        return `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`;
      }).join('\n\n');

      return {
        success: true,
        output: `Search results for "${query}" (${results.length} found):\n\n${formatted}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: `Web search failed: ${message}`,
      };
    }
  },
};
