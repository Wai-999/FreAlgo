/**
 * Article type (FreAlgo 2.0): opinion / analysis / news, assigned only on evidence the publisher
 * provides. Most feeds do not say, so UNKNOWN is the honest default and the UI shows no badge.
 * The basis string records the evidence, e.g. `category "Opinion"` or `URL path /commentisfree/`.
 *
 * Evidence, strongest first: the publisher's category, the article's URL path, a headline prefix
 * such as "Opinion:". A news-section category ("World", "Politics") is NOT treated as evidence of
 * straight news, because sections mix news, analysis and live pages.
 */
export const ARTICLE_TYPE_RULES_VERSION = 1;

export type ArticleType = 'NEWS' | 'OPINION' | 'ANALYSIS' | 'UNKNOWN';

const OPINION_WORDS =
  'opinion|opinions|opinião|opiniao|opinión|opinion piece|comment|commentary|commentisfree|editorial|editorials|column|columns|columnist|columnists|op-ed|oped|tribune|tribuna|chronique|meinung|kommentar|leitartikel|kolumne|letters';
const ANALYSIS_WORDS =
  'analysis|news analysis|análise|analise|análisis|analisis|analyse|explainer|explainers|explained|hintergrund|fact check|factcheck';

const OPINION_CATEGORY = new RegExp(`^(?:${OPINION_WORDS})$`, 'iu');
const ANALYSIS_CATEGORY = new RegExp(`^(?:${ANALYSIS_WORDS})$`, 'iu');
// Whole path segments only: "/opinion/…" yes, "/world/leader-of-…" or "/comments-sought" no.
const OPINION_PATH = new RegExp(`/(?:${OPINION_WORDS.replace(/ /g, '-')})(?:/|$)`, 'iu');
const ANALYSIS_PATH = new RegExp(`/(?:${ANALYSIS_WORDS.replace(/ /g, '-')})(?:/|$)`, 'iu');
const OPINION_PREFIX =
  /^\s*(?:opinion|comment|editorial|op-ed|opinião|opinión|tribune|meinung)\s*[:|–—-]\s*/iu;
const ANALYSIS_PREFIX = /^\s*(?:analysis|explainer|análise|análisis|analyse)\s*[:|–—-]\s*/iu;

export function classifyArticleType(input: { url: string; categories: string[]; title: string }): {
  type: ArticleType;
  basis: string | null;
} {
  for (const raw of input.categories) {
    const c = raw.trim();
    if (OPINION_CATEGORY.test(c)) return { type: 'OPINION', basis: `category "${c.slice(0, 40)}"` };
    if (ANALYSIS_CATEGORY.test(c))
      return { type: 'ANALYSIS', basis: `category "${c.slice(0, 40)}"` };
  }
  let path = '';
  try {
    path = new URL(input.url).pathname;
  } catch {
    // keep empty
  }
  const op = OPINION_PATH.exec(path);
  if (op) return { type: 'OPINION', basis: `URL path ${op[0]}` };
  const an = ANALYSIS_PATH.exec(path);
  if (an) return { type: 'ANALYSIS', basis: `URL path ${an[0]}` };
  const pre = OPINION_PREFIX.exec(input.title);
  if (pre) return { type: 'OPINION', basis: `headline prefix "${pre[0].trim()}"` };
  const pa = ANALYSIS_PREFIX.exec(input.title);
  if (pa) return { type: 'ANALYSIS', basis: `headline prefix "${pa[0].trim()}"` };
  return { type: 'UNKNOWN', basis: null };
}
