/** 插件管理器中的 A3、A4 和 A5 包列表。 */
import type { PortableNodeMap } from "../../relation-host/packages/node-map-package.ts";
import type {
  ElementPluginPackage,
  NodeTypePluginPackage,
} from "../../relation-host/contracts/package-types.ts";
import styles from "../../relation-host/view/relation-host.module.css";

export function ElementPackageList({
  disabled,
  packages,
  onDisable,
  onUninstall,
}: {
  disabled: Set<string>;
  packages: ElementPluginPackage[];
  onDisable: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  if (!packages.length) {
    return <div className={styles.empty}>未安装 A3</div>;
  }

  return <>{packages.map((plugin) => {
    const id = plugin.manifest.packageId;
    return <article key={id}>
      <div>
        <strong>{plugin.manifest.name}</strong>
        <span>{disabled.has(id) ? "已禁用" : ""}</span>
        <button onClick={() => onDisable(id)}>禁用</button>
        <button onClick={() => onUninstall(id)}>卸载</button>
      </div>
      <p>{plugin.manifest.elements
        .map((item) => `${item.id}:${item.purpose}`)
        .join("、")}</p>
      <small>{id}@{plugin.manifest.packageVersion}</small>
    </article>;
  })}</>;
}

export function NodeTypePackageList({
  disabled,
  packages,
  onDisable,
  onUninstall,
}: {
  disabled: Set<string>;
  packages: NodeTypePluginPackage[];
  onDisable: (id: string) => void;
  onUninstall: (id: string) => void;
}) {
  if (!packages.length) {
    return <div className={styles.empty}>未安装 A4</div>;
  }

  return <>{packages.map((plugin) => {
    const id = plugin.manifest.packageId;
    return <article key={id}>
      <div>
        <strong>{plugin.manifest.name}</strong>
        <span>{disabled.has(id) ? "已禁用" : ""}</span>
        <button onClick={() => onDisable(id)}>禁用</button>
        <button onClick={() => onUninstall(id)}>卸载</button>
      </div>
      <p>{plugin.manifest.typeNodeIds.join("、")}</p>
      <small>{id}@{plugin.manifest.packageVersion}</small>
    </article>;
  })}</>;
}

export function NodeMapPackageList({
  nodeMaps,
  onOpen,
}: {
  nodeMaps: PortableNodeMap[];
  onOpen: (nodeMap: PortableNodeMap) => void | Promise<void>;
}) {
  if (!nodeMaps.length) {
    return <div className={styles.empty}>
      未导入 A5；核心不会自动获得领域能力。
    </div>;
  }

  return <>{nodeMaps.map((portable) => {
    const nodeMap = portable.nodeMap;
    return <article key={portable.contentSha256}>
      <div>
        <strong>{nodeMap.manifest.name}</strong>
        <button onClick={() => void onOpen(portable)}>再打开</button>
      </div>
      <p>{nodeMap.manifest.rootNodeIds.join("、")}</p>
      <small>
        {nodeMap.manifest.packageId}@{nodeMap.manifest.packageVersion}
      </small>
    </article>;
  })}</>;
}
