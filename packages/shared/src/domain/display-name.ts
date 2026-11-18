import { parse } from 'tldts';

/** Proper names for popular websites whose brand cannot be derived from the domain. */
const KNOWN_WEBSITE_NAMES: Readonly<Record<string, string>> = {
  'aws.amazon.com': 'AWS',
  'amazon.com': 'Amazon',
  'bbc.co.uk': 'BBC',
  'bbc.com': 'BBC',
  'bing.com': 'Bing',
  'bsky.app': 'Bluesky',
  'calendar.google.com': 'Google Calendar',
  'chatgpt.com': 'ChatGPT',
  'chess.com': 'Chess.com',
  'claude.ai': 'Claude',
  'cnn.com': 'CNN',
  'discord.com': 'Discord',
  'disneyplus.com': 'Disney+',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'duckduckgo.com': 'DuckDuckGo',
  'ebay.com': 'eBay',
  'espn.com': 'ESPN',
  'facebook.com': 'Facebook',
  'figma.com': 'Figma',
  'gemini.google.com': 'Gemini',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'google.com': 'Google',
  'hotstar.com': 'Hotstar',
  'hulu.com': 'Hulu',
  'imdb.com': 'IMDb',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'mail.google.com': 'Gmail',
  'mail.yahoo.com': 'Yahoo Mail',
  'meet.google.com': 'Google Meet',
  'messenger.com': 'Messenger',
  'music.apple.com': 'Apple Music',
  'netflix.com': 'Netflix',
  'news.google.com': 'Google News',
  'news.ycombinator.com': 'Hacker News',
  'notion.so': 'Notion',
  'nytimes.com': 'The New York Times',
  'openai.com': 'OpenAI',
  'outlook.live.com': 'Outlook',
  'outlook.office.com': 'Outlook',
  'paypal.com': 'PayPal',
  'perplexity.ai': 'Perplexity',
  'pinterest.com': 'Pinterest',
  'primevideo.com': 'Prime Video',
  'producthunt.com': 'Product Hunt',
  'quora.com': 'Quora',
  'reddit.com': 'Reddit',
  'snapchat.com': 'Snapchat',
  'spotify.com': 'Spotify',
  'stackoverflow.com': 'Stack Overflow',
  'steampowered.com': 'Steam',
  'teams.microsoft.com': 'Microsoft Teams',
  'telegram.org': 'Telegram',
  'threads.com': 'Threads',
  'threads.net': 'Threads',
  'tiktok.com': 'TikTok',
  'tv.apple.com': 'Apple TV',
  'twitch.tv': 'Twitch',
  'twitter.com': 'Twitter',
  'whatsapp.com': 'WhatsApp',
  'wikipedia.org': 'Wikipedia',
  'x.com': 'X',
  'youtube.com': 'YouTube',
  'zoom.us': 'Zoom',
};

const capitalizeWords = (label: string): string =>
  label
    .split(/[-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Human-friendly name for a canonical website key.
 *   youtube.com → "YouTube" (known), example.co.uk → "Example", keep.google.com → "Google Keep",
 *   alice.github.io → "alice.github.io" (hosting tenant), localhost → "localhost".
 */
export function getWebsiteDisplayName(domain: string): string {
  const known = KNOWN_WEBSITE_NAMES[domain];
  if (known) return known;

  const parsed = parse(domain, { allowPrivateDomains: true, extractHostname: false });
  const base = parsed.domainWithoutSuffix;
  if (parsed.isIp || !parsed.domain || !base || parsed.isPrivate || base.startsWith('xn--')) {
    return domain;
  }

  const name = capitalizeWords(base);
  const service = parsed.subdomain ? parsed.subdomain.split('.').at(-1) : undefined;
  if (service && !service.startsWith('xn--')) return `${name} ${capitalizeWords(service)}`;
  return name;
}
