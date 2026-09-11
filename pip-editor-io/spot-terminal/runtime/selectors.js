export const pip = (node, predicate) => node?.pips.find((item) => item.predicate_value?.predicate.node_id === predicate);
export const scalar = (node, predicate, fallback) => {
  const item = pip(node, predicate);
  return item?.predicate_value?.value?.kind === "const" ? item.predicate_value.value.value : fallback;
};
export const target = (node, predicate) => pip(node, predicate)?.predicate_value?.value?.target;
