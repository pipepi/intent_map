# Three-layer node plugins

The prototype separates reusable executable UI, declarative node definitions, and node instance data.

## Package layers

- `*.intent-element.zip` contains `manifest.json`, a self-contained `entry.mjs`, and disclosed sources. The module registers the Web Component tags declared by its manifest.
- `*.intent-node-type.json` contains no code. It binds fields and previews to exact element plugin IDs and versions.
- `*.intent-collection.zip` contains `collection.json` plus the exact redistributable node type and element dependencies required by its nodes.

All formats use `schemaVersion: 1`. Importers validate complete packages before committing application state. Archives reject unsafe paths and bounded-size violations.

## Trust model

Element modules execute in the host window with the same DOM and network authority as the editor. The current development mode does not sandbox or verify publisher signatures. Manifest permissions, source hashes, disclosures, and community tags are informational metadata for a future marketplace review flow.

Web Components cannot be unregistered. Disabling an element plugin removes it from editor resolution, but previously executed code and registered tags remain until the page is refreshed. Node type plugins are declarative and do not execute code.

## Runtime contract

Control elements receive `field`, `value`, and declared static properties as attributes. They report edits with a bubbling and composed `intent-value-change` custom event whose detail is `{ field, value }`. Preview elements receive their bound value through the `value` attribute.

Element entry modules must be self-contained and may not use external or relative imports. Collection export fails when a required element manifest has `redistributable: false`.
