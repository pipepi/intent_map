import type { NodeTypePackage } from "./package-types";

export type NodeTypeDefinition = NodeTypePackage["nodeTypes"][number];
export type IntentPlugin = NodeTypePackage;

export type CanvasNode = {
  id: string;
  type: string;
  name: string;
  values: Record<string, string>;
  x: number;
  y: number;
};

export type DefinitionEntry = { plugin: IntentPlugin; definition: NodeTypeDefinition };
