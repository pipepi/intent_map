const apps = document.querySelector("#apps");
const status = document.querySelector("#status");

const activate = async (file) => {
  status.textContent = `正在启动 ${file}…`;
  const response = await fetch("/__pip/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file }),
  });
  if (!response.ok) throw new Error(await response.text());
  window.location.replace("/");
};

const render = (catalog) => {
  apps.replaceChildren();
  catalog.apps.forEach((app) => {
    const item = document.createElement(app.valid ? "button" : "div");
    item.className = "app";
    if (app.valid) item.type = "button";
    const title = document.createElement("strong");
    title.textContent = app.name ?? app.file;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = app.valid
      ? `${app.layer} · ${app.packageVersion} · ${app.releaseDate} · ${app.file}`
      : app.file;
    item.append(title, meta);
    if (app.error) {
      const error = document.createElement("span");
      error.className = "error";
      error.textContent = app.error;
      item.append(error);
    }
    if (app.valid) item.addEventListener("click", () => activate(app.file).catch(showError));
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
  const defaults = catalog.apps.filter((app) => app.valid && app.packageId === config.defaultPackageId);
  if (!catalog.forceSelection && defaults.length === 1) {
    await activate(defaults[0].file);
  } else {
    status.textContent = defaults.length > 1
      ? "默认应用存在多个版本，请手动选择。"
      : catalog.apps.length ? "请选择要启动的 PIP。" : "pip 目录中没有应用。";
    render(catalog);
  }
} catch (error) {
  showError(error);
}
