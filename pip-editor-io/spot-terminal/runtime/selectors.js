export const relation = (node, predicate) => node?.relations.find((item) => item.predicate.nodeId === predicate);
export const scalar = (node, predicate, fallback) => {
  const item = relation(node, predicate);
  return item?.object?.kind === "const" ? item.object.value : fallback;
};
export const target = (node, predicate) => relation(node, predicate)?.object?.target;
