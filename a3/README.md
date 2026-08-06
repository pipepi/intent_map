# a3 extensions

This root contains business-independent extensions built on the a2 generic
intent editor. a3 may import a2 public contracts and the shared PIP runtime;
`app/editor/` must never import a3 implementation details.

- `core/`: extension and capability protocols;
- `host/`: extension lifecycle and workspace composition;
- `workspace/`: split intent/resource storage;
- `bundle/`: portable Bundle import and export;
- `extensions/`: concrete capabilities such as Software Authoring.

Split workspaces use `intent.pip` plus a sibling `resources/` directory. The PIP
contains only the generic intent document and `a3/workspace/resources.json`, a
deterministic index of external paths, media types, byte lengths, and SHA-256
hashes. Resource bytes remain ordinary files and never pass through a2.
