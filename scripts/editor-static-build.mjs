/** Shared esbuild configuration and HTML assembly for production and development. */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

export const projectRoot = path.resolve(import.meta.dirname, "..");
export const editorOutput = path.join(projectRoot, "out");
const entryPoint = "pip-editor/web/main.tsx";

export const editorBuildOptions = (overrides = {}) => ({
  absWorkingDir: projectRoot,
  entryPoints: [entryPoint],
  outdir: editorOutput,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  metafile: true,
  sourcemap: false,
  minify: true,
  entryNames: "assets/[name]-[hash]",
  chunkNames: "assets/chunk-[hash]",
  assetNames: "assets/[name]-[hash]",
  logLevel: "info",
  ...overrides,
});

const outputHref = (outputPath) =>
  `./${path.relative(editorOutput, path.resolve(projectRoot, outputPath)).split(path.sep).join("/")}`;

export async function writeEditorShell(metafile) {
  const javascript = Object.entries(metafile.outputs).find(([outputPath, output]) =>
    output.entryPoint === entryPoint && outputPath.endsWith(".js"));
  if (!javascript) throw new Error("esbuild did not emit the editor JavaScript entry");

  const [javascriptPath, javascriptOutput] = javascript;
  const cssPath = javascriptOutput.cssBundle;
  if (!cssPath) throw new Error("esbuild did not emit the editor stylesheet");

  const template = await readFile(path.join(projectRoot, "pip-editor/web/index.html"), "utf8");
  const assets = [
    `<link rel="stylesheet" href="${outputHref(cssPath)}" />`,
    `<script type="module" src="${outputHref(javascriptPath)}"></script>`,
  ].join("\n    ");
  if (!template.includes("<!-- editor-assets -->")) {
    throw new Error("Editor HTML template has no asset insertion point");
  }
  await mkdir(editorOutput, { recursive: true });
  await Promise.all([
    writeFile(path.join(editorOutput, "index.html"), template.replace("<!-- editor-assets -->", assets)),
    copyFile(path.join(projectRoot, "pip-editor/web/favicon.svg"), path.join(editorOutput, "favicon.svg")),
  ]);
}

export async function buildEditorStatic() {
  await rm(editorOutput, { recursive: true, force: true });
  const result = await build(editorBuildOptions());
  await writeEditorShell(result.metafile);
}
