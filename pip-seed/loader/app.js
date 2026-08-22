const apps = document.querySelector("#apps");
const status = document.querySelector("#status");

const activate = async (origin, file) => {
  status.textContent = `正在启动 ${file}…`;
  const response = await fetch("/__pip/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin, file }),
  });
  if (!response.ok) throw new Error(await response.text());
  window.location.replace("/");
};

const trust = async (sha256) => {
  const response = await fetch("/__pip/trust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sha256 }),
  });
  if (!response.ok) throw new Error(await response.text());
  window.location.reload();
};

const render = (catalog) => {
  apps.replaceChildren();
  catalog.packages.filter((app) => app.layer === "a2" || !app.valid).forEach((app) => {
    const runnable = app.valid && (app.origin === "system" || app.trustedForExecution);
    const item = document.createElement(runnable ? "button" : "div");
    item.className = "app";
    if (runnable) item.type = "button";
    const title = document.createElement("strong");
    title.textContent = app.name ?? app.file;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = app.valid
      ? `${app.origin} · ${(app.providedEditorKinds ?? []).join(", ")} · ${app.packageVersion} · ${app.file}`
      : app.file;
    item.append(title, meta);
    if (app.error) {
      const error = document.createElement("span");
      error.className = "error";
      error.textContent = app.error;
      item.append(error);
    }
    if (app.valid && !runnable) {
      const error = document.createElement("span");
      error.className = "error";
      error.textContent = "该用户编辑器尚未按 SHA-256 授权执行。";
      item.append(error);
      if (app.origin === "user" && app.sha256) {
        const trustButton = document.createElement("button");
        trustButton.type = "button";
        trustButton.textContent = "信任此版本";
        trustButton.addEventListener("click", () => trust(app.sha256).catch(showError));
        item.append(trustButton);
      }
    }
    if (runnable) item.addEventListener("click", () => activate(app.origin, app.file).catch(showError));
    apps.append(item);
  });
};

const showError = (error) => { status.textContent = error instanceof Error ? error.message : String(error); };

try {
  const [catalogResponse, configResponse] = await Promise.all([
    fetch("/__pip/catalog"),
    fetch("config.json"),
  ]);
  if (!catalogResponse.ok) throw new Error(await catalogResponse.text());
  const catalog = await catalogResponse.json();
  const config = await configResponse.json();
  const defaults = catalog.packages.filter((app) => app.valid && app.origin === "system" && app.layer === "a2" && app.packageId === config.defaultEditorPackageId);
  if (!catalog.forceSelection && defaults.length === 1) {
    await activate(defaults[0].origin, defaults[0].file);
  } else {
    status.textContent = defaults.length > 1
      ? "默认应用存在多个版本，请手动选择。"
      : catalog.packages.length ? "请选择通用节点编辑器。" : "没有可用的 a2 编辑器。";
    render(catalog);
  }
} catch (error) {
  showError(error);
}
