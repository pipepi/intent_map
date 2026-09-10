/** 管理 A3/A4 安装状态与 A5 catalog，并向 RelationHost 暴露稳定操作。 */
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  browserElementRuntime,
  ElementPluginRegistry,
} from "./activation/element-registry.ts";
import {
  browserNodeTypeRuntime,
  NodeTypePluginRegistry,
} from "./activation/node-type-registry.ts";
import type {
  ElementPluginPackage,
  NodeTypePluginPackage,
  PluginInstallStatus,
} from "./contracts/package-types.ts";
import { browserTrustHashes } from "./packages/import-pip.ts";
import {
  createNodeMapWorkspace,
  PortableNodeMapCatalog,
  type PortableNodeMap,
} from "./packages/node-map-package.ts";
import { validateNodeTypeDependencies } from "./packages/node-type-package.ts";
import { trustPackageHashes } from "../pip/host-client.ts";
import { usePipImportQueue } from "./use-pip-import-queue.ts";
import {
  graphFingerprint,
  type WorkspaceSession,
  type WorkspaceSessionStore,
} from "./workspace/workspace-store.ts";

type PluginCatalogOptions = {
  onOpenWorkspace: (workspace: WorkspaceSession) => void;
  setMessage: Dispatch<SetStateAction<string>>;
  workspaceStore: WorkspaceSessionStore;
};

export function usePluginCatalog({
  onOpenWorkspace,
  setMessage,
  workspaceStore,
}: PluginCatalogOptions) {
  // Registry 绑定已执行的浏览器模块，整个 RelationHost 生命周期只创建一次。
  const [elements] = useState(
    () => new ElementPluginRegistry(browserElementRuntime()),
  );
  const [nodeTypes] = useState(
    () => new NodeTypePluginRegistry(browserNodeTypeRuntime()),
  );
  const [elementPackages, setElementPackages] = useState<
    ElementPluginPackage[]
  >([]);
  const [nodeTypePackages, setNodeTypePackages] = useState<
    NodeTypePluginPackage[]
  >([]);
  const [disabledElements, setDisabledElements] = useState(new Set<string>());
  const [disabledNodeTypes, setDisabledNodeTypes] = useState(
    new Set<string>(),
  );
  const [nodeMaps, setNodeMaps] = useState<PortableNodeMap[]>([]);
  const nodeMapCatalogRef = useRef(new PortableNodeMapCatalog());

  const persistTrust = async (hashes: string[]) =>
    location.protocol === "pip:"
      ? trustPackageHashes(hashes)
      : browserTrustHashes(hashes);

  async function installElement(
    plugin: ElementPluginPackage,
  ): Promise<PluginInstallStatus> {
    const status = await elements.install(plugin);
    setDisabledElements((current) => {
      const next = new Set(current);
      next.delete(plugin.manifest.packageId);
      return next;
    });
    setElementPackages((current) =>
      current.some(
        (item) => item.manifest.packageId === plugin.manifest.packageId,
      )
        ? current
        : [...current, plugin],
    );
    return status;
  }

  async function installNodeType(
    plugin: NodeTypePluginPackage,
  ): Promise<PluginInstallStatus> {
    validateNodeTypeDependencies(
      plugin,
      elements.list().filter((item) => item.active),
    );
    const status = await nodeTypes.install(plugin);
    setDisabledNodeTypes((current) => {
      const next = new Set(current);
      next.delete(plugin.manifest.packageId);
      return next;
    });
    setNodeTypePackages((current) =>
      current.some(
        (item) => item.manifest.packageId === plugin.manifest.packageId,
      )
        ? current
        : [...current, plugin],
    );
    return status;
  }

  const rollbackElement = (id: string) => {
    elements.uninstall(id);
    setElementPackages((current) =>
      current.filter((item) => item.manifest.packageId !== id),
    );
  };

  const rollbackNodeType = (id: string) => {
    nodeTypes.uninstall(id);
    setNodeTypePackages((current) =>
      current.filter((item) => item.manifest.packageId !== id),
    );
  };

  async function openNodeMap(portable: PortableNodeMap) {
    const status = nodeMapCatalogRef.current.install(portable);
    setNodeMaps(nodeMapCatalogRef.current.list());

    const base = createNodeMapWorkspace(
      portable.nodeMap,
      crypto.randomUUID(),
      portable.contentSha256,
    );
    const workspace: WorkspaceSession = {
      ...base,
      undo: [],
      redo: [],
      capabilityDiagnostics: [],
      savedGraphFingerprint: graphFingerprint(base.graph),
    };
    workspaceStore.add(workspace);
    onOpenWorkspace(workspace);

    setMessage(
      `${status === "installed" ? "已打开" : "已再次打开"} Node Map ${portable.nodeMap.manifest.name}`,
    );
  }

  const imports = usePipImportQueue({
    context: () => ({
      confirmTrust: () => true,
      trustHashes: persistTrust,
      installElement,
      installNodeType,
      openNodeMap,
      uninstallElement: rollbackElement,
      uninstallNodeType: rollbackNodeType,
    }),
    onMessage: setMessage,
    // Registry 是同步事实源，不依赖 React catalog state 是否已完成重渲染。
    resolveInstalled: (reference) =>
      elements.list().find(
        (item) => item.contentSha256 === reference.sha256,
      )?.pipBytes ??
      nodeTypes.list().find(
        (item) => item.contentSha256 === reference.sha256,
      )?.pipBytes,
  });

  return {
    disabledElements,
    disabledNodeTypes,
    elementPackages,
    elements,
    importBatch: imports.importBatch,
    installFiles: imports.installFiles,
    installElement,
    installNodeType,
    nodeMaps,
    nodeTypePackages,
    nodeTypes,
    openNodeMap,
    persistTrust,
    rollbackElement,
    rollbackNodeType,
    setDisabledElements,
    setDisabledNodeTypes,
    setElementPackages,
    setNodeTypePackages,
  };
}
