# a3 extensions

This root contains business-independent extensions built on the a2 generic
intent editor. a3 may import a2 public contracts and the shared PIP runtime;
`app/editor/` must never import a3 implementation details.

- `core/`: extension and capability protocols;
- `host/`: extension lifecycle and workspace composition;
- `workspace/`: split intent/resource storage;
- `bundle/`: portable Bundle import and export;
- `projection/`: optional outer-tree identity, diagnostics, and lazy resource sessions;
- `extensions/`: concrete capabilities such as Software Authoring.

Split workspaces use `intent.pip` plus a sibling `resources/` directory. The PIP
contains only the generic intent document and `a3/workspace/resources.json`, a
deterministic index of external paths, media types, byte lengths, and SHA-256
hashes. Resource bytes remain ordinary files and never pass through a2.

Custom a3 semantics use `intent-map.a3.custom-node` envelopes that a2 preserves
without interpretation. Optional projections live in
`resources/a3/projections/index.json`; source drift is diagnosable and remains
editable instead of making the workspace unloadable.
