# AEX Spot Terminal A3/A4

This suite intentionally ships as two independent packages:

- `official.spot-terminal-elements` (A3) owns the dark trading UI and semantic DOM events.
- `official.spot-terminal-types` (A4) owns authentication, HTTP/STOMP clients, validation, runtime state and the terminal creator.

Build with `npm run plugins:relation:build`. The generated A4 PIP embeds its exact redistributable A3 dependency, so importing A4 installs A3 first and then activates A4 atomically. The standalone A3 PIP remains available for inspection and development. In a blank workspace, press Space and choose **现货交易终端**.

The terminal expects `http://127.0.0.1:8080`. Development username login must be enabled by `spot.terminal.dev-login-enabled`; production deployments must disable it. Access tokens remain in the active A4 module and are never written into RelationGraph or exported A5 data.
