import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseError } from './errors';

/**
 * RSS 2.0, RSS 1.0 (RDF) and Atom 1.0 parser producing a format-neutral item list.
 * Security: documents declaring a DOCTYPE/ENTITY are rejected before parsing (no XXE, no entity
 * expansion bombs); only the five XML entities and numeric references are decoded.
 */

export type FeedFormat = 'RSS2' | 'RSS1' | 'ATOM';

export interface RawFeedItem {
  guid: string | null;
  guidIsPermaLink: boolean;
  link: string | null;
  title: string | null;
  summary: string | null;
  content: string | null;
  published: string | null;
  updated: string | null;
  author: string | null;
  categories: string[];
  imageUrl: string | null;
  language: string | null;
}

export interface ParsedFeed {
  format: FeedFormat;
  title: string | null;
  link: string | null;
  language: string | null;
  items: RawFeedItem[];
}

export const MAX_ITEMS_PER_FEED = 300;

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  removeNSPrefix: false,
  maxNestedTags: 64,
});

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Extracts text from a node that may be a string, {#text}, or an object with attributes. */
function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') {
    const t = (v as Node)['#text'];
    if (t !== undefined) return text(t);
  }
  return null;
}

function attr(v: unknown, name: string): string | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const a = (v as Node)[`@_${name}`];
    return typeof a === 'string' ? a.trim() || null : null;
  }
  return null;
}

function firstImage(item: Node): string | null {
  for (const key of ['media:content', 'media:thumbnail', 'enclosure']) {
    for (const m of toArray(item[key] as unknown)) {
      const url = attr(m, 'url');
      const type = attr(m, 'type') ?? attr(m, 'medium') ?? '';
      if (url && (key !== 'enclosure' || /^image\//.test(type))) return url;
    }
  }
  const group = item['media:group'] as Node | undefined;
  if (group) return firstImage(group);
  return null;
}

function rssItem(item: Node): RawFeedItem {
  const guidNode = item.guid;
  const guid = text(guidNode);
  const permaAttr = attr(guidNode, 'isPermaLink');
  return {
    guid,
    guidIsPermaLink: permaAttr === null ? false : permaAttr.toLowerCase() === 'true',
    link: text(item.link) ?? attr(item.link, 'href'),
    title: text(item.title),
    summary: text(item.description) ?? text(item['dc:description']),
    content: text(item['content:encoded']),
    published: text(item.pubDate) ?? text(item['dc:date']) ?? text(item['dcterms:issued']),
    updated: text(item['dcterms:modified']) ?? text(item['atom:updated']),
    author: text(item['dc:creator']) ?? text(item.author),
    categories: toArray(item.category as unknown)
      .concat(toArray(item['dc:subject'] as unknown))
      .map(text)
      .filter((c): c is string => !!c),
    imageUrl: firstImage(item),
    language: text(item['dc:language']),
  };
}

function atomLink(entry: Node): string | null {
  const links = toArray(entry.link as unknown);
  const alternate =
    links.find(
      (l) =>
        (attr(l, 'rel') ?? 'alternate') === 'alternate' &&
        (attr(l, 'type') ?? 'text/html').includes('html'),
    ) ?? links.find((l) => (attr(l, 'rel') ?? 'alternate') === 'alternate');
  return attr(alternate, 'href') ?? text(alternate);
}

function atomEntry(entry: Node, feedLang: string | null): RawFeedItem {
  const author = toArray(entry.author as unknown)[0];
  return {
    guid: text(entry.id),
    guidIsPermaLink: false,
    link: atomLink(entry),
    title: text(entry.title),
    summary: text(entry.summary),
    content: text(entry.content),
    published: text(entry.published) ?? text(entry.issued),
    updated: text(entry.updated) ?? text(entry.modified),
    author: author && typeof author === 'object' ? text((author as Node).name) : text(author),
    categories: toArray(entry.category as unknown)
      .map((c) => attr(c, 'label') ?? attr(c, 'term') ?? text(c))
      .filter((c): c is string => !!c),
    imageUrl: firstImage(entry),
    language: attr(entry, 'xml:lang') ?? feedLang,
  };
}

export function parseFeed(xml: string): ParsedFeed {
  const head = xml.slice(0, 4096);
  if (/<!DOCTYPE/i.test(head) || /<!ENTITY/i.test(xml)) {
    throw parseError('Feeds declaring a DOCTYPE or ENTITY are rejected');
  }
  if (!/^\s*(?:﻿)?\s*(<\?xml|<rss|<feed|<rdf:RDF|<!--)/i.test(head)) {
    throw parseError('Response is not an XML feed');
  }

  const valid = XMLValidator.validate(xml);
  if (valid !== true) {
    throw parseError(`Malformed XML at line ${valid.err.line}: ${valid.err.msg}`.slice(0, 300));
  }

  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (err) {
    throw parseError(`Malformed XML: ${(err as Error).message}`.slice(0, 300));
  }

  const rss = doc.rss as Node | undefined;
  if (rss && typeof rss === 'object') {
    const channel = (toArray(rss.channel as unknown)[0] ?? {}) as Node;
    return {
      format: 'RSS2',
      title: text(channel.title),
      link: text(channel.link) ?? attr(toArray(channel.link as unknown)[0], 'href'),
      language: text(channel.language) ?? text(channel['dc:language']),
      items: toArray(channel.item as unknown)
        .slice(0, MAX_ITEMS_PER_FEED)
        .map((i) => rssItem(i as Node)),
    };
  }

  const rdf = doc['rdf:RDF'] as Node | undefined;
  if (rdf && typeof rdf === 'object') {
    const channel = (toArray(rdf.channel as unknown)[0] ?? {}) as Node;
    return {
      format: 'RSS1',
      title: text(channel.title),
      link: text(channel.link),
      language: text(channel['dc:language']),
      items: toArray(rdf.item as unknown)
        .slice(0, MAX_ITEMS_PER_FEED)
        .map((i) => {
          const item = i as Node;
          const parsed = rssItem(item);
          return { ...parsed, guid: parsed.guid ?? attr(item, 'rdf:about') };
        }),
    };
  }

  const feed = doc.feed as Node | undefined;
  if (feed && typeof feed === 'object') {
    const lang = attr(feed, 'xml:lang');
    return {
      format: 'ATOM',
      title: text(feed.title),
      link: atomLink(feed),
      language: lang,
      items: toArray(feed.entry as unknown)
        .slice(0, MAX_ITEMS_PER_FEED)
        .map((e) => atomEntry(e as Node, lang)),
    };
  }

  throw parseError('Unrecognised feed format (expected RSS 2.0, RSS 1.0 or Atom)');
}
