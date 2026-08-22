# PIP Loader

This directory is the complete source boundary of the a1 `pip-loader` package.
It reads the catalog exposed by a Seed host, asks the user to trust eligible
user packages, selects exactly one a2 editor, and requests its activation.

```text
pip-seed host API → catalog/trust/activate → pip-loader → a2 editor
```

- `config.json` identifies the default editor package.
- `app.js` implements catalog selection, trust and activation requests.
- `index.html` and `styles.css` provide the minimal loader interface.

The Seed hosts own filesystem access, package verification and the HTTP API;
the Loader remains a replaceable, package-delivered UI and policy client.
