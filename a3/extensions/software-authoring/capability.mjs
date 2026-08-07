export const descriptor = Object.freeze({
  abi: "pip-capability/1",
  capabilities: ["software-authoring/1"],
  commands: ["describe-project", "validate-project"],
  customNodeKinds: [
    "business-constraint/1",
    "business-flow-scenario/1",
    "software-intent-goal/1",
  ],
  projectionKinds: [],
});

const customNamespace = "intent-map.a3.custom-node";
const diagnostic = (nodeId, code, message, level = "error") => ({
  level,
  code,
  nodeId,
  message,
});

const text = (value) => typeof value === "string" && value.trim().length > 0;

const validateSettings = (kind, settings, nodeId) => {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [diagnostic(nodeId, "invalid-settings", `${kind} settings must be an object`)];
  }
  if (kind === "software-intent-goal/1") {
    return text(settings.objective)
      ? []
      : [diagnostic(nodeId, "missing-objective", "Software intent goal requires objective")];
  }
  if (kind === "business-flow-scenario/1") {
    const diagnostics = [];
    if (!text(settings.scenario)) diagnostics.push(diagnostic(nodeId, "missing-scenario", "Business flow requires scenario"));
    if (!text(settings.outcome)) diagnostics.push(diagnostic(nodeId, "missing-outcome", "Business flow requires outcome"));
    return diagnostics;
  }
  if (kind === "business-constraint/1") {
    return text(settings.statement)
      ? []
      : [diagnostic(nodeId, "missing-statement", "Business constraint requires statement")];
  }
  return [diagnostic(nodeId, "unsupported-custom-node", `Unsupported custom-node kind: ${kind}`, "warning")];
};

const validateTree = (root) => {
  if (!root || typeof root !== "object" || typeof root.id !== "string") {
    return [diagnostic("", "missing-project-root", "Software project is missing a root intent node")];
  }
  const diagnostics = [];
  const visit = (node) => {
    const extension = node?.extension;
    if (extension?.namespace === customNamespace) {
      if (extension.schemaVersion !== 1 || !extension.data || typeof extension.data !== "object") {
        diagnostics.push(diagnostic(node.id ?? "", "invalid-custom-node", "Invalid a3 custom-node envelope"));
      } else if (extension.data.capability === "software-authoring/1") {
        diagnostics.push(...validateSettings(extension.data.kind, extension.data.settings, node.id ?? ""));
      }
    }
    if (Array.isArray(node?.children)) node.children.forEach(visit);
  };
  visit(root);
  return diagnostics;
};

export async function invoke(request) {
  if (request?.command === "describe-project") {
    return {
      authoringKind: request.payload?.authoringKind ?? "software-project/1",
      customNodeKinds: descriptor.customNodeKinds,
      projectionKinds: descriptor.projectionKinds,
      surfaces: ["inner-intent", "projection-diagnostics"],
    };
  }
  if (request?.command === "validate-project") {
    return {
      diagnostics: validateTree(request.payload?.rootIntent),
    };
  }
  throw new Error(`Unsupported software-authoring command: ${request?.command ?? "unknown"}`);
}
