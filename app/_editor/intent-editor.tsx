"use client";

import { useMemo, useRef, useState } from "react";
import { ElementPluginRegistry, browserElementRuntime } from "./plugin-editor/element-runtime";
import { decodeElementPackage } from "./plugin-editor/element-package";
import { decodeCollectionPackage, encodeCollectionPackage, selectCollection } from "./plugin-editor/collection-package";
import { parseNodeTypePackage, validateNodeTypeDependencies } from "./plugin-editor/node-type-registry";
import type { ElementPluginPackage } from "./plugin-editor/package-types";
import { sampleElementArchives, SAMPLE_NODE_TYPE_PACKAGES } from "./plugin-editor/sample-packages";
import { NodeCanvas } from "./plugin-editor/node-canvas";
import { PluginPanel } from "./plugin-editor/plugin-panel";
import type { CanvasNode, IntentPlugin, NodeTypeDefinition } from "./plugin-editor/types";
import styles from "./plugin-editor/editor.module.css";

export function IntentEditor() {
  const [plugins, setPlugins] = useState<IntentPlugin[]>([]);
  const [elementPlugins, setElementPlugins] = useState<ElementPluginPackage[]>([]);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("安装插件后即可添加节点");
  const registryRef = useRef<ElementPluginRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new ElementPluginRegistry(browserElementRuntime());
  const registry = registryRef.current;

  const definitions = useMemo(() => new Map(plugins.flatMap((plugin) =>
    plugin.nodeTypes.map((definition) => [definition.type, { plugin, definition }] as const),
  )), [plugins]);

  async function install(file: File) {
    try {
      if (file.name.endsWith(".zip")) {
        const plugin = await decodeElementPackage(new Uint8Array(await file.arrayBuffer()));
        await registry.install(plugin);
        setElementPlugins((current) => [...current, plugin]);
        setMessage(`已安装可执行元素插件 ${plugin.manifest.name}`);
        return;
      }
      const plugin = parseNodeTypePackage(await file.text());
      validateNodeTypeDependencies(plugin, elementPlugins);
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
    const plugin = entries[0].plugin;
    const exported: IntentPlugin = { ...plugin, id: names.length === 1 ? plugin.id : "local.export-bundle", name: names.length === 1 ? names[0] : `${names.join(" + ")} bundle`, nodeTypes: entries.map((entry) => entry.definition), dependencies: [...new Map(entries.flatMap((entry) => entry.plugin.dependencies).map((dep) => [dep.id, dep])).values()] };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${exported.id}.intent-node-type.json`; anchor.click(); URL.revokeObjectURL(anchor.href);
    setMessage(`已导出 ${entries.length} 种节点类型`);
  }

  function collection(includeAll: boolean) {
    const base = { format: "intent-node-collection" as const, schemaVersion: 1 as const, id: crypto.randomUUID(), name: includeAll ? "全部节点" : "选中节点", dependencies: plugins.map(({ id, version }) => ({ id, version })), nodes, edges: [] };
    const output = includeAll ? base : selectCollection(base, selectedIds);
    const usedTypes = new Set(output.nodes.map((node) => node.type));
    const typePackages = plugins.filter((plugin) => plugin.nodeTypes.some((type) => usedTypes.has(type.type)));
    const requiredElements = new Set(typePackages.flatMap((plugin) => plugin.dependencies.map((dep) => dep.id)));
    const archive = encodeCollectionPackage({ collection: { ...output, dependencies: typePackages.map(({ id, version }) => ({ id, version })) }, nodeTypes: typePackages, elementPlugins: elementPlugins.filter((plugin) => requiredElements.has(plugin.manifest.id)) });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([archive as Uint8Array<ArrayBuffer>], { type: "application/zip" })); anchor.download = `${includeAll ? "all" : "selection"}.intent-collection.zip`; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  async function importCollection(file: File) {
    try {
      const portable = await decodeCollectionPackage(new Uint8Array(await file.arrayBuffer()));
      const allElements = [...elementPlugins, ...portable.elementPlugins];
      portable.nodeTypes.forEach((plugin) => validateNodeTypeDependencies(plugin, allElements));
      for (const plugin of portable.elementPlugins) if (!elementPlugins.some((item) => item.manifest.id === plugin.manifest.id)) await registry.install(plugin);
      setElementPlugins((current) => [...current, ...portable.elementPlugins.filter((plugin) => !current.some((item) => item.manifest.id === plugin.manifest.id))]);
      setPlugins((current) => [...current, ...portable.nodeTypes.filter((plugin) => !current.some((item) => item.id === plugin.id))]);
      setNodes((current) => [...current, ...portable.collection.nodes.map((node) => ({ ...node, id: current.some((item) => item.id === node.id) ? crypto.randomUUID() : node.id }))]);
      setMessage(`已导入集合 ${portable.collection.name}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "集合导入失败"); }
  }

  async function installSamples() {
    try {
      const archives = await sampleElementArchives();
      const decoded = await Promise.all(archives.map(decodeElementPackage));
      for (const plugin of decoded) await registry.install(plugin);
      setElementPlugins(decoded);
      SAMPLE_NODE_TYPE_PACKAGES.forEach((plugin) => validateNodeTypeDependencies(plugin, decoded));
      setPlugins(SAMPLE_NODE_TYPE_PACKAGES);
      setMessage("已安装 2 个元素插件和 2 个节点类型插件");
    } catch (error) { setMessage(error instanceof Error ? error.message : "样例安装失败"); }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><span>INTENT PLUGIN EDITOR</span><h1>插件化节点画布</h1></div>
        <div className={styles.addArea}>
          <button onClick={() => collection(false)} disabled={!selectedIds.size}>导出选中集合</button>
          <button onClick={() => collection(true)} disabled={!nodes.length}>导出全部</button>
          <button className={styles.primary} onClick={() => setAdding((value) => !value)}>＋ 添加节点</button>
          {adding && <div className={styles.typeMenu}>
            {definitions.size ? [...definitions.values()].map(({ definition }) =>
              <button key={definition.type} onClick={() => addNode(definition)}>{definition.displayName}<small>{definition.type}</small></button>)
              : <p>请先安装插件</p>}
          </div>}
        </div>
      </header>
      <div className={styles.layout}>
        <NodeCanvas nodes={nodes} definitions={definitions} selectedIds={selectedIds} registry={registry}
          onSelectionChange={setSelectedIds}
          onValueChange={(id, key, value) => setNodes((current) => current.map((node) => node.id === id ? { ...node, values: { ...node.values, [key]: value } } : node))}
          onExport={exportSelection} />
        <PluginPanel plugins={plugins} elementPlugins={elementPlugins} message={message} onInstall={install} onImportCollection={importCollection} onInstallSamples={installSamples}
          onDisableElement={(id) => { registry.disable(id); setElementPlugins((current) => current.filter((plugin) => plugin.manifest.id !== id)); setMessage(`已禁用 ${id}；刷新页面才能完全清除已执行代码`); }}
          onUninstall={(id) => { setPlugins((current) => current.filter((plugin) => plugin.id !== id)); setMessage(`已卸载 ${id}`); }} />
      </div>
    </main>
  );
}
