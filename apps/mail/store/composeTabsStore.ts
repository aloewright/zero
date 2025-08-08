import { atomWithStorage } from 'jotai/utils';
import { atom } from 'jotai';

export interface ComposeTab {
  id: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  draftId?: string | null;
  attachments?: File[];
  createdAt: number;
  lastModified: number;
  isMinimized?: boolean;
}

export const isMobileAtom = atom<boolean>(false);

export const composeTabsAtom = atomWithStorage<Map<string, ComposeTab>>('composeTabs', new Map(), {
  getItem: (key, initialValue): Map<string, ComposeTab> => {
    const stored = localStorage.getItem(key);
    if (!stored) return initialValue;
    try {
      const parsed = JSON.parse(stored);
      return new Map(parsed);
    } catch {
      return initialValue;
    }
  },
  setItem: (key, value) => {
    localStorage.setItem(key, JSON.stringify(Array.from(value.entries())));
  },
  removeItem: (key) => localStorage.removeItem(key),
});

export const activeComposeTabIdAtom = atom<string | null>(null);
export const fullscreenTabIdAtom = atom<string | null>(null);

export const addComposeTabAtom = atom(null, async (get, set, tab: Partial<ComposeTab>) => {
  const tabs = await get(composeTabsAtom);
  const isMobile = get(isMobileAtom);

  if (isMobile) {
    const entries = Array.from(tabs.entries());
    if (entries.length > 0) {
      const [existingId, existingTab] = entries[0];

      const hasPrefill = Boolean(
        tab?.draftId ||
          (tab?.to && tab.to.length > 0) ||
          (tab?.cc && tab.cc.length > 0) ||
          (tab?.bcc && tab.bcc.length > 0) ||
          (tab?.attachments && tab.attachments.length > 0) ||
          (tab?.subject && tab.subject.trim().length > 0) ||
          (tab?.body && tab.body.trim().length > 0),
      );

      if (!hasPrefill) {
        if (existingTab?.isMinimized) {
          set(updateComposeTabAtom, { id: existingId, updates: { isMinimized: false } });
        }
        set(activeComposeTabIdAtom, existingId);
        return existingId;
      }

      const id = `compose-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newTab: ComposeTab = {
        id,
        createdAt: Date.now(),
        lastModified: Date.now(),
        isMinimized: false,
        ...tab,
      };

      const newTabs = new Map<string, ComposeTab>();
      newTabs.set(id, newTab);
      set(composeTabsAtom, newTabs);
      set(activeComposeTabIdAtom, id);
      return id;
    }
  }

  const id = `compose-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const newTab: ComposeTab = {
    id,
    createdAt: Date.now(),
    lastModified: Date.now(),
    isMinimized: false,
    ...tab,
  };

  const newTabs = new Map(tabs);
  newTabs.set(id, newTab);
  set(composeTabsAtom, newTabs);
  set(activeComposeTabIdAtom, id);

  return id;
});

export const removeComposeTabAtom = atom(null, async (get, set, tabId: string) => {
  const tabs = await get(composeTabsAtom);
  const isMobile = get(isMobileAtom);
  const removedTab = tabs.get(tabId);

  const newTabs = new Map(tabs);
  newTabs.delete(tabId);
  set(composeTabsAtom, newTabs);

  if (get(fullscreenTabIdAtom) === tabId) {
    set(fullscreenTabIdAtom, null);
  }

  if (get(activeComposeTabIdAtom) === tabId) {
    const remainingTabs = Array.from(newTabs.entries());

    if (remainingTabs.length > 0) {
      if (isMobile && removedTab && !removedTab.isMinimized) {
        const minimizedTabs = remainingTabs
          .filter(([_, t]) => t.isMinimized)
          .sort((a, b) => b[1].lastModified - a[1].lastModified);

        if (minimizedTabs.length > 0) {
          const [nextTabId] = minimizedTabs[0];
          set(updateComposeTabAtom, { id: nextTabId, updates: { isMinimized: false } });
          set(activeComposeTabIdAtom, nextTabId);
        } else {
          const lastTabId = remainingTabs[remainingTabs.length - 1][0];
          set(activeComposeTabIdAtom, lastTabId);
        }
      } else {
        const lastTabId = remainingTabs[remainingTabs.length - 1][0];
        set(activeComposeTabIdAtom, lastTabId);
      }
    } else {
      set(activeComposeTabIdAtom, null);
    }
  }
});

export const updateComposeTabAtom = atom(
  null,
  async (get, set, { id, updates }: { id: string; updates: Partial<ComposeTab> }) => {
    const tabs = await get(composeTabsAtom);
    const tab = tabs.get(id);
    if (!tab) return;

    const updatedTab = {
      ...tab,
      ...updates,
      lastModified: Date.now(),
    };

    const newTabs = new Map(tabs);
    newTabs.set(id, updatedTab);
    set(composeTabsAtom, newTabs);
  },
);

export const toggleMinimizeTabAtom = atom(null, async (get, set, tabId: string) => {
  const tabs = await get(composeTabsAtom);
  const tab = tabs.get(tabId);
  if (!tab) return;

  const isMobile = get(isMobileAtom);

  const updatedTab = {
    ...tab,
    isMinimized: !tab.isMinimized,
  };

  const newTabs = new Map(tabs);
  newTabs.set(tabId, updatedTab);
  set(composeTabsAtom, newTabs);

  if (!updatedTab.isMinimized) {
    set(activeComposeTabIdAtom, tabId);
  } else if (isMobile && updatedTab.isMinimized) {
    //  do nothing
  }
});

export const toggleFullscreenTabAtom = atom(null, (get, set, tabId: string | null) => {
  const isMobile = get(isMobileAtom);

  if (isMobile) return;

  const currentFullscreen = get(fullscreenTabIdAtom);

  if (currentFullscreen === tabId) {
    set(fullscreenTabIdAtom, null);
  } else {
    set(fullscreenTabIdAtom, tabId);
    if (tabId) {
      set(activeComposeTabIdAtom, tabId);
    }
  }
});

export const switchMobileTabAtom = atom(null, (get, set, targetId: string) => {
  const tabs = get(composeTabsAtom);
  const currentActiveId = get(activeComposeTabIdAtom);

  if (currentActiveId && currentActiveId !== targetId) {
    const currentTab = tabs.get(currentActiveId);
    if (currentTab && !currentTab.isMinimized) {
      set(updateComposeTabAtom, { id: currentActiveId, updates: { isMinimized: true } });
    }
  }

  set(updateComposeTabAtom, { id: targetId, updates: { isMinimized: false } });

  set(activeComposeTabIdAtom, targetId);
});
