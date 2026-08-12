"use client";

import { useRef } from "react";
import type { ElementPluginPackage } from "./package-types";
import type { IntentPlugin } from "./types";
import styles from "./editor.module.css";

type Props = {
  plugins: IntentPlugin[];
  elementPlugins: ElementPluginPackage[];
  message: string;
  onInstall: (file: File) => void;
  onImportCollection: (file: File) => void;
  onInstallSamples: () => void;
  onUninstall: (id: string) => void;
  onDisableElement: (id: string) => void;
};

export function PluginPanel({ plugins, elementPlugins, message, onInstall, onImportCollection, onInstallSamples, onUninstall, onDisableElement }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const collectionRef = useRef<HTMLInputElement>(null);
  return <aside className={styles.panel} data-testid="plugin-manager">
    <div className={styles.panelTitle}><div><span>PLUGIN MANAGER</span><h2>三层插件管理</h2></div></div>
    <div className={styles.panelActions}>
      <button className={styles.primary} onClick={() => inputRef.current?.click()}>安装插件文件</button>
      <button onClick={() => collectionRef.current?.click()}>导入节点集合</button>
      <button onClick={onInstallSamples} data-testid="install-samples">安装两个样例</button>
    </div>
    <input ref={inputRef} type="file" accept="application/json,.json,.zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onInstall(file); event.currentTarget.value = ""; }} />
    <input ref={collectionRef} type="file" accept=".zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportCollection(file); event.currentTarget.value = ""; }} />
    <p className={styles.message} data-testid="status-message">{message}</p>
    <h3>节点元素插件 <small>可执行代码 · 开发模式全信任</small></h3>
    <div className={styles.pluginList} data-testid="element-plugin-list">
      {elementPlugins.length ? elementPlugins.map((plugin) => <article key={plugin.manifest.id}>
        <div><strong>{plugin.manifest.name}</strong><button onClick={() => onDisableElement(plugin.manifest.id)}>禁用</button></div>
        <p>{plugin.manifest.elements.map((element) => element.id).join("、")}</p>
        <small>{plugin.manifest.id}@{plugin.manifest.version}<br />权限：{plugin.manifest.permissions.join(", ") || "无"}<br />标签：{plugin.manifest.communityTags.join(", ")}</small>
      </article>) : <div className={styles.empty}>暂无元素插件</div>}
    </div>
    <h3>节点类型插件</h3>
    <div className={styles.pluginList} data-testid="node-type-plugin-list">
      {plugins.length ? plugins.map((plugin) => <article key={plugin.id}>
        <div><strong>{plugin.name}</strong><button onClick={() => onUninstall(plugin.id)}>卸载</button></div>
        <p>{plugin.nodeTypes.map((type) => type.displayName).join("、")}</p>
        <small>{plugin.id}@{plugin.version}</small>
      </article>) : <div className={styles.empty}>暂无节点类型插件</div>}
    </div>
    <h3>节点集合</h3><p className={styles.hint}>从顶部导出选中或全部节点；集合 ZIP 自包含可再分发依赖。</p>
  </aside>;
}
