export function canCancelFlowSession(session) {
  return Boolean(session && ["running", "draining"].includes(session.status));
}

export function liveFlowNodeIds(session) {
  if (!canCancelFlowSession(session)) return new Set();
  const latest = new Map();
  for (const item of session.trace ?? []) latest.set(item.nodeId, item.kind);
  return new Set([...latest].filter(([, kind]) => ["queued", "running", "backpressured"].includes(kind)).map(([nodeId]) => nodeId));
}
