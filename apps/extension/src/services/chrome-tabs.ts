import type { OpenTab } from '@/types';

/**
 * Reduces a Chrome tab to what the Add Website screen needs. Tabs without an id or URL (e.g. still
 * initializing) are dropped; incognito tabs are never offered. URL filtering (http/https only)
 * happens during grouping, so this stays a faithful snapshot of the browser.
 */
export function toOpenTab(tab: chrome.tabs.Tab): OpenTab | null {
  const url = tab.url || tab.pendingUrl;
  if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE || !url || tab.incognito) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title?.trim() ?? '',
    url,
    faviconUrl: tab.favIconUrl ?? null,
  };
}

/** All open tabs across all normal windows. */
export async function getOpenTabs(): Promise<OpenTab[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.map(toOpenTab).filter((tab): tab is OpenTab => tab !== null);
}

/**
 * Calls `onChange` whenever the set of open tabs, or a tab's URL/title/favicon, changes.
 * Returns an unsubscribe function.
 */
export function subscribeToTabChanges(onChange: () => void): () => void {
  const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo): void => {
    if (changeInfo.url !== undefined || changeInfo.title !== undefined || changeInfo.favIconUrl !== undefined) {
      onChange();
    }
  };
  const handleAny = (): void => onChange();

  chrome.tabs.onCreated.addListener(handleAny);
  chrome.tabs.onRemoved.addListener(handleAny);
  chrome.tabs.onReplaced.addListener(handleAny);
  chrome.tabs.onUpdated.addListener(handleUpdated);
  return () => {
    chrome.tabs.onCreated.removeListener(handleAny);
    chrome.tabs.onRemoved.removeListener(handleAny);
    chrome.tabs.onReplaced.removeListener(handleAny);
    chrome.tabs.onUpdated.removeListener(handleUpdated);
  };
}
