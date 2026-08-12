"use client";

import { useRef } from "react";
import type { IntentPlugin } from "./types";
import styles from "./editor.module.css";

type Props = { plugins: IntentPlugin[]; message: string; onInstall: (file: File) => void; onUninstall: (name: string) => void };

export function PluginPanel({ plugins, message, onInstall, onUninstall }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <aside className={styles.panel}>
    <div className={styles.panelTitle}><div><span>PLUGIN MANAGER</span><h2>插件管理</h2></div><button className={styles.primary} onClick={() => inputRef.current?.click()}>安装插件</button></div>
    <input ref={inputRef} type="file" accept="application/json,.json,.zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onInstall(file); event.currentTarget.value = ""; }} />
    <p className={styles.message}>{message}</p>
    <div className={styles.sampleLinks}><span>样例：</span><a href="/sample-plugins/text-plugin.json" download>文本插件</a><a href="/sample-plugins/media-plugin.json" download>图文插件</a></div>
    <div className={styles.pluginList}>
      {plugins.length ? plugins.map((plugin) => <article key={plugin.name}>
        <div><strong>{plugin.name}</strong><button onClick={() => onUninstall(plugin.name)}>卸载插件</button></div>
        <p>{plugin.nodeTypes.map((type) => type.displayName).join("、")}</p>
        <small>{plugin.nodeTypes.map((type) => type.type).join(" · ")}</small>
      </article>) : <div className={styles.empty}>暂无插件<br /><small>下载上方样例后点击“安装插件”</small></div>}
    </div>
  </aside>;
}
