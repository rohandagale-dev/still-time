/**
 * Browser observation for the tracking engine. Event payloads are only *triggers*: the engine
 * always re-reads the real browser state here, which makes it immune to out-of-order events and
 * to platform quirks such as Linux window managers briefly reporting "no window focused" while
 * focus moves between two Chrome windows.
 */

export type IdleState = 'active' | 'idle' | 'locked';

export interface ActiveTabSnapshot {
  id: number;
  /** URL of the page shown in the tab (`undefined` while unknown). Never persisted. */
  url: string | undefined;
  /** The tab is currently playing audio. */
  audible: boolean;
  incognito: boolean;
}

export interface BrowserObservation {
  /** A Chrome window has OS focus (or Stilltime's toolbar popup is open over one). */
  windowFocused: boolean;
  /** Active tab of the focused window, if any. */
  activeTab: ActiveTabSnapshot | null;
  idleState: IdleState;
}

export interface BrowserObserver {
  observe(idleThresholdSeconds: number): Promise<BrowserObservation>;
  setIdleDetectionInterval(seconds: number): void;
}

/**
 * Whether Stilltime's toolbar popup is open, and over which window (Chrome does not always
 * report it). Opening the popup takes OS focus from the browser window on several platforms, yet
 * the user is still in front of that window — checking your stats must not pause (and split) the
 * session you are in. An action popup closes as soon as it loses focus, so while it is open the
 * user is necessarily in Chrome.
 */
async function openPopup(): Promise<{ open: boolean; windowId: number | undefined }> {
  const contexts = await chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.POPUP] })
    .catch((): chrome.runtime.ExtensionContext[] => []);
  return {
    open: contexts.length > 0,
    windowId: contexts.find((context) => context.windowId !== chrome.windows.WINDOW_ID_NONE)?.windowId,
  };
}

export function createChromeBrowserObserver(): BrowserObserver {
  return {
    async observe(idleThresholdSeconds) {
      const { NORMAL, POPUP, APP } = chrome.windows.WindowType;
      const [lastFocused, idleState, popup] = await Promise.all([
        chrome.windows.getLastFocused({ windowTypes: [NORMAL, POPUP, APP] }).catch(() => null),
        chrome.idle.queryState(idleThresholdSeconds).catch((): IdleState => 'active'),
        openPopup(),
      ]);

      const windowId = popup.windowId ?? (lastFocused?.focused || popup.open ? lastFocused?.id : undefined);
      if (windowId === undefined) return { windowFocused: false, activeTab: null, idleState };

      const [tab] = await chrome.tabs.query({ active: true, windowId });
      return {
        windowFocused: true,
        idleState,
        activeTab: tab
          ? {
              id: tab.id ?? chrome.tabs.TAB_ID_NONE,
              url: tab.url || tab.pendingUrl || undefined,
              audible: tab.audible === true,
              incognito: tab.incognito,
            }
          : null,
      };
    },
    setIdleDetectionInterval(seconds) {
      chrome.idle.setDetectionInterval(seconds);
    },
  };
}
