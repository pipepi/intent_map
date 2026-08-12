export type PluginField = {
  key: string;
  label: string;
  control: "input" | "textarea";
  defaultValue: string;
};

export type PluginElement = {
  kind: "text" | "image";
  sourceField: string;
};

export type NodeTypeDefinition = {
  type: string;
  displayName: string;
  defaultName: string;
  fields: PluginField[];
  ui: { kind: "card"; elements: PluginElement[] };
};

export type IntentPlugin = {
  schemaVersion: 1;
  name: string;
  nodeTypes: NodeTypeDefinition[];
};

export type CanvasNode = {
  id: string;
  type: string;
  name: string;
  values: Record<string, string>;
  x: number;
  y: number;
};

export type DefinitionEntry = { plugin: IntentPlugin; definition: NodeTypeDefinition };
