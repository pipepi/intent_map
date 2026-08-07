# Software Authoring

The default business-independent a3 extension. It interprets versioned inner
intent goal, business-flow scenario, and business-constraint custom nodes. a2
only preserves their opaque payloads.

The v1 worker exposes declared `describe-project`, `validate-project`, and
`plan-specification` commands. Its first outer-tree projection is a small
Markdown software specification. The a3 host validates every proposal before
writing ordinary workspace resources; it never silently deletes superseded or
manually edited files.

Controlled build adapters, tests, previews, promotion, and self-hosting are the
next layer built on this boundary rather than features of the a2 editor.
