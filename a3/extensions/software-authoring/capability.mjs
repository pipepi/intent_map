export const descriptor = Object.freeze({
  abi: "pip-capability/1",
  capabilities: ["software-authoring/1"],
  commands: ["describe-project", "validate-project"],
});

export async function invoke(request) {
  if (request?.command === "describe-project") {
    return {
      authoringKind: request.payload?.authoringKind ?? "software-project/1",
      surfaces: ["source-tree", "code", "json", "diagnostics"],
    };
  }
  if (request?.command === "validate-project") {
    return {
      diagnostics: request.payload?.rootNodeId
        ? []
        : [{ level: "error", message: "Software project is missing rootNodeId" }],
    };
  }
  throw new Error(`Unsupported software-authoring command: ${request?.command ?? "unknown"}`);
}
