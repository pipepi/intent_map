export const descriptor = Object.freeze({
  abi: "pip-capability/1",
  capabilities: ["software-authoring/1"],
  commands: ["describe-project", "plan-specification", "validate-project"],
  customNodeKinds: [
    "business-constraint/1",
    "business-flow-scenario/1",
    "software-intent-goal/1",
  ],
  projectionKinds: ["software-specification/1"],
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

const safeId = (value, label) => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new Error(`${label} must use lowercase identifier characters`);
  }
  return value;
};

const safeResourcePath = (value) => {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\")) {
    throw new Error("Specification resource path is unsafe");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Specification resource path is unsafe");
  }
  return value;
};

const markdown = (node) => {
  const data = node.extension.data;
  const settings = data.settings;
  const lines = [`# ${node.name || node.id}`, "", node.description || "", ""];
  if (data.kind === "software-intent-goal/1") {
    lines.push("## Objective", "", settings.objective, "");
    if (settings.deepGoal) lines.push("## Deep goal", "", settings.deepGoal, "");
  } else if (data.kind === "business-flow-scenario/1") {
    lines.push("## Scenario", "", settings.scenario, "");
    if (settings.trigger) lines.push("## Trigger", "", settings.trigger, "");
    lines.push("## Outcome", "", settings.outcome, "");
    if (settings.constraints?.length) {
      lines.push("## Constraints", "", ...settings.constraints.map((item) => `- ${item}`), "");
    }
  } else if (data.kind === "business-constraint/1") {
    lines.push("## Constraint", "", settings.statement, "");
    if (settings.rationale) lines.push("## Rationale", "", settings.rationale, "");
  }
  return `${lines.join("\n").trim()}\n`;
};

const planSpecification = (payload) => {
  const node = payload?.node;
  if (!node || typeof node !== "object" || !node.extension) {
    throw new Error("Specification projection requires one custom intent node");
  }
  const extension = node.extension;
  if (
    extension.namespace !== customNamespace
    || extension.schemaVersion !== 1
    || extension.data?.capability !== "software-authoring/1"
  ) {
    throw new Error("Specification source is not a Software Authoring custom node");
  }
  const diagnostics = validateSettings(extension.data.kind, extension.data.settings, node.id ?? "");
  const errors = diagnostics.filter(({ level }) => level === "error");
  if (errors.length) throw new Error(errors.map(({ message }) => message).join("; "));
  if (!descriptor.customNodeKinds.includes(extension.data.kind)) {
    throw new Error(`Unsupported specification source: ${extension.data.kind}`);
  }
  const normalizedNodeId = String(node.id).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z]+/, "");
  const suffix = normalizedNodeId || "intent";
  const projectionId = safeId(payload?.projectionId ?? `spec-${suffix}`, "projectionId");
  const resourcePath = safeResourcePath(payload?.resourcePath ?? `docs/${suffix}.md`);
  return {
    schemaVersion: 1,
    projectionId,
    kind: "software-specification/1",
    sourceNodeId: node.id,
    capability: "software-authoring/1",
    resources: [{
      path: resourcePath,
      mediaType: "text/markdown; charset=utf-8",
      bytes: new TextEncoder().encode(markdown(node)),
    }],
  };
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
  if (request?.command === "plan-specification") {
    return planSpecification(request.payload);
  }
  if (request?.command === "validate-project") {
    return {
      diagnostics: validateTree(request.payload?.rootIntent),
    };
  }
  throw new Error(`Unsupported software-authoring command: ${request?.command ?? "unknown"}`);
}
