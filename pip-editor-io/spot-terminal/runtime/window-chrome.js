export function withWindowChrome(state, workspaceView, projectionNodeId, title = "Spot Trading Terminal", options = []) {
  const views = workspaceView && typeof workspaceView === "object" && !Array.isArray(workspaceView) ? workspaceView : {};
  // A semantic route can display a child projection whose id differs from the root window id.
  const entry = Object.entries(views.projections ?? {}).find(([, candidate]) => {
    const navigation = candidate?.navigation;
    return navigation?.entries?.[navigation.index]?.projectionNodeId === projectionNodeId;
  });
  const windowId = entry?.[0], frame = entry?.[1], navigation = frame?.navigation;
  if (!frame || !navigation) return state;
  // Host view state may contain optional undefined keys. Projection data crosses the
  // plugin boundary as JSON, so normalize the frame before exposing it to A3.
  const jsonFrame = JSON.parse(JSON.stringify(frame));
  return { ...state, windowChrome: {
    windowId, frame: jsonFrame, title,
    options,
    canBack: navigation.index > 0, canForward: navigation.index < navigation.entries.length - 1,
    scale: Number(navigation.semanticScale ?? 1),
  } };
}
