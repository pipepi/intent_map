"use client";

import { useMemo, useState } from "react";
import { downloadPlugin, readPluginFile } from "./plugin-editor/plugin-io";
import { NodeCanvas } from "./plugin-editor/node-canvas";
import { PluginPanel } from "./plugin-editor/plugin-panel";
import type { CanvasNode, IntentPlugin, NodeTypeDefinition } from "./plugin-editor/types";
import styles from "./plugin-editor/editor.module.css";

export function IntentEditor() {
  const [plugins, setPlugins] = useState<IntentPlugin[]>([]);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("安装插件后即可添加节点");

  const definitions = useMemo(() => new Map(plugins.flatMap((plugin) =>
    plugin.nodeTypes.map((definition) => [definition.type, { plugin, definition }] as const),
  )), [plugins]);

  async function install(file: File) {
    try {
      const plugin = await readPluginFile(file);
      if (plugins.some((item) => item.name === plugin.name)) throw new Error(`插件 “${plugin.name}” 已安装`);
      const occupied = new Set(plugins.flatMap((item) => item.nodeTypes.map((type) => type.type)));
      const conflict = plugin.nodeTypes.find((type) => occupied.has(type.type));
      if (conflict) throw new Error(`节点类型 “${conflict.type}” 已由其他插件提供`);
      setPlugins((current) => [...current, plugin]);
      setMessage(`已安装 ${plugin.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件安装失败");
    }
  }

  function addNode(definition: NodeTypeDefinition) {
    const values = Object.fromEntries(definition.fields.map((field) => [field.key, field.defaultValue]));
    setNodes((current) => [...current, {
      id: crypto.randomUUID(), type: definition.type, name: definition.defaultName, values,
      x: 28 + (current.length % 3) * 284, y: 28 + Math.floor(current.length / 3) * 300,
    }]);
    setAdding(false);
  }

  function exportSelection() {
    const selected = nodes.filter((node) => selectedIds.has(node.id));
    const entries = [...new Map(selected.flatMap((node) => {
      const entry = definitions.get(node.type);
      return entry ? [[node.type, entry] as const] : [];
    })).values()];
    if (!entries.length) return;
    const names = [...new Set(entries.map((entry) => entry.plugin.name))].sort();
    downloadPlugin({ schemaVersion: 1, name: names.length === 1 ? names[0] : `${names.join(" + ")} bundle`, nodeTypes: entries.map((entry) => entry.definition) });
    setMessage(`已导出 ${entries.length} 种节点类型`);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><span>INTENT PLUGIN EDITOR</span><h1>插件化节点画布</h1></div>
        <div className={styles.addArea}>
          <button className={styles.primary} onClick={() => setAdding((value) => !value)}>＋ 添加节点</button>
          {adding && <div className={styles.typeMenu}>
            {definitions.size ? [...definitions.values()].map(({ definition }) =>
              <button key={definition.type} onClick={() => addNode(definition)}>{definition.displayName}<small>{definition.type}</small></button>)
              : <p>请先安装插件</p>}
          </div>}
        </div>
      </header>
      <div className={styles.layout}>
        <NodeCanvas nodes={nodes} definitions={definitions} selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onValueChange={(id, key, value) => setNodes((current) => current.map((node) => node.id === id ? { ...node, values: { ...node.values, [key]: value } } : node))}
          onExport={exportSelection} />
        <PluginPanel plugins={plugins} message={message} onInstall={install}
          onUninstall={(name) => { setPlugins((current) => current.filter((plugin) => plugin.name !== name)); setMessage(`已卸载 ${name}`); }} />
      </div>
    </main>
  );
}
