# a3 extensions

This root contains generic capability and resource-workspace infrastructure.
Domain node semantics now live in externally installed executable RelationNode
type plugins; the core does not carry an Intent or Scene extension envelope.

- `core/`: extension and capability protocols;
- `host/`: extension lifecycle and workspace composition;
- `workspace/`: split intent/resource storage;
- `bundle/`: portable Bundle import and export;

Split workspaces use `intent.pip` plus a sibling `resources/` directory. The PIP
contains only the generic intent document and `a3/workspace/resources.json`, a
deterministic index of external paths, media types, byte lengths, and SHA-256
hashes. Resource bytes remain ordinary files and never pass through a2.

RelationNode plugins register validators, commands, executors, projections and
language providers through the versioned node-type host ABI.
