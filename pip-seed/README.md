# PIP Seed

PIP Seed is the smallest self-bootstrapping mechanism that can grow into the
PIP Editor. Each directory names one step in that process:

```text
cli / tauri → runtime → repo → loader → pip-editor
```

- `cli/` and `tauri/` provide the native entry points.
- `runtime/` discovers, verifies, trusts, and activates PIP files.
- `repo/` stores the authoritative system PIP files maintained here.
- `loader/` is the a1 browser UI that selects and activates an a2 editor.

The Rust crate names, executable names, PIP package identities, and loader ABI
remain stable even though their source directories are grouped here.
