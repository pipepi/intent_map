# a3 extensions

This root contains business-independent extensions built on the a2 generic
intent editor. a3 may import a2 public contracts and the shared PIP runtime;
`app/editor/` must never import a3 implementation details.

- `core/`: extension and capability protocols;
- `host/`: extension lifecycle and workspace composition;
- `workspace/`: split intent/resource storage;
- `bundle/`: portable Bundle import and export;
- `extensions/`: concrete capabilities such as Software Authoring.
