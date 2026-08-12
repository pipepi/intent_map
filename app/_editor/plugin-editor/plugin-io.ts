import { parsePlugin } from "./plugin-schema";
import type { IntentPlugin } from "./types";

export async function readPluginFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".json")) throw new Error("请选择 JSON 插件文件");
  try {
    return parsePlugin(JSON.parse(await file.text()));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("插件文件不是有效 JSON");
    throw error;
  }
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "intent-plugin";
}

export function downloadPlugin(plugin: IntentPlugin) {
  const blob = new Blob([JSON.stringify(plugin, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFileName(plugin.name)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
