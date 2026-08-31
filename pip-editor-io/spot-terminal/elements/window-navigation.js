import { esc } from "./format.js";

export function windowChromeKey(state) {
  const chrome = state?.windowChrome, navigation = chrome?.frame?.navigation;
  if (!chrome || !navigation) return "";
  const current = navigation.entries?.[navigation.index]?.projectionNodeId ?? "";
  return JSON.stringify([
    chrome.windowId, chrome.canBack, chrome.canForward,
    navigation.index, navigation.semanticScale, current, chrome.options ?? [],
  ]);
}

export function windowNavigation(state) {
  const chrome = state.windowChrome;
  if (!chrome) return "";
  const options = chrome.options?.length ? chrome.options : [{ projectionNodeId: "", label: chrome.title }];
  const current = chrome.frame?.navigation?.entries?.[chrome.frame.navigation.index]?.projectionNodeId;
  return `<nav class="plugin-window-nav" aria-label="交易终端窗口导航">
    <button data-window-back aria-label="后退" ${chrome.canBack ? "" : "disabled"}>‹</button>
    <button data-window-forward aria-label="前进" ${chrome.canForward ? "" : "disabled"}>›</button>
    <select data-window-projection aria-label="当前投影">${options.map((option) =>
      `<option value="${esc(option.projectionNodeId)}" ${option.projectionNodeId === current ? "selected" : ""}>${esc(option.label)}</option>`).join("")}</select>
  </nav>`;
}
