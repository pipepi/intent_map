/** Watches the browser adapter and serves generated assets with SSE reloads. */
import { createReadStream } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { context } from "esbuild";

import { editorBuildOptions, editorOutput, writeEditorShell } from "./editor-static-build.mjs";

const port = Number(process.env.PORT ?? 3000);
const reloadClients = new Set();
let firstBuild = true;
const reloadScript = `<script>
new EventSource('/__editor_reload').addEventListener('reload', () => location.reload());
</script>`;

const liveReloadPlugin = {
  name: "editor-live-reload",
  setup(build) {
    build.onStart(() => rm(path.join(editorOutput, "assets"), { recursive: true, force: true }));
    build.onEnd(async (result) => {
      if (result.errors.length || !result.metafile) return;
      await writeEditorShell(result.metafile);
      if (firstBuild) firstBuild = false;
      else for (const response of reloadClients) response.write("event: reload\ndata: now\n\n");
    });
  },
};

const builder = await context(editorBuildOptions({
  minify: false,
  logLevel: "info",
  plugins: [liveReloadPlugin],
}));
await builder.rebuild();
await builder.watch();

const mimeFor = (file) => ({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
}[path.extname(file)] ?? "application/octet-stream");

const server = createServer(async (request, response) => {
  if (request.url === "/__editor_reload") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write("event: ready\ndata: ready\n\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }

  const rawPath = (request.url ?? "/").split("?", 1)[0];
  const relative = rawPath === "/" ? "index.html" : rawPath.slice(1);
  if (!relative || relative.includes("..") || relative.includes("\\") || relative.includes("%")) {
    response.writeHead(400).end("unsafe path");
    return;
  }
  const file = path.join(editorOutput, relative);
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    response.setHeader("content-type", mimeFor(file));
    response.setHeader("cache-control", "no-store");
    if (relative === "index.html") {
      const html = await readFile(file, "utf8");
      response.end(html.replace("</body>", `${reloadScript}</body>`));
    } else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Pip editor: http://127.0.0.1:${port}\n`);
});

const stop = async () => {
  server.close();
  await builder.dispose();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
