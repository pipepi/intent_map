/** 自举核心概念，并补齐 GRAPH / DOCUMENT 元数据所需的谓词节点。 */
import { PipForkLevel, type Pip } from "./types.ts";
import { createGraph, META } from "./pip-model.ts";
import { assertPipGraph } from "./graph-validation.ts";

export const createCorePipGraph = (): Pip => {
  const ids = [
    "pip.core.identity",
    "pip.core.predicate",
    "pip.core.type",
    ...Object.values(META),
  ];
  const nodes = Object.fromEntries(ids.map((id): [string, Pip] => [id, {
    id,
    fork_level: PipForkLevel.NODE,
    pips: [
      {
        id: "identity",
        fork_level: PipForkLevel.PIPE,
        predicate_value: {
          predicate: { node_id: "pip.core.identity", pip_id: "identity" },
          value: { kind: "const", value: id },
        },
        pips: [],
      },
      {
        id: "type",
        fork_level: PipForkLevel.PIPE,
        predicate_value: {
          predicate: { node_id: "pip.core.type", pip_id: "identity" },
          value: {
            kind: "ref",
            target: { node_id: "pip.core.predicate", pip_id: "identity" },
          },
        },
        pips: [],
      },
    ],
  }]));
  const graph = createGraph(nodes);
  assertPipGraph(graph);
  return graph;
};
