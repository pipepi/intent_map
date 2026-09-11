/** 构建浏览器下载或原生启动器所需的 Node Map 导出文件。 */
import {
  decodePip,
  pipFilename,
  UNLIMITED_PIP_IO_POLICY,
  type PipPackageRef,
} from "../pip-package/index.ts";
import type { PipCatalogEntry } from "../pip-package/profile.ts";
import {
  readHostCatalog,
  readHostPackage,
} from "../pip-package/host-client.ts";
import { exportNativeNodeMap, exportNodeMap } from "./packages/export-node-map.ts";
import type { PortableNodeMap } from "./packages/node-map-package.ts";
import type { WorkspaceSession } from "./workspace/workspace-store.ts";

type WorkspaceExport = {
  blob: Blob;
  fileName: string;
  message: string;
};

type ExactCatalogEntry = PipCatalogEntry & Required<Pick<
  PipCatalogEntry,
  "packageId" | "packageVersion" | "releaseDate" | "sha256"
>>;

const packageRef = (
  entry: ExactCatalogEntry,
): PipPackageRef => ({
  origin: entry.origin as "system" | "user",
  packageId: entry.packageId,
  version: entry.packageVersion,
  releaseDate: entry.releaseDate,
  sha256: entry.sha256,
});

async function attachNativeLaunchProfile(
  source: PortableNodeMap,
): Promise<PortableNodeMap> {
  const catalog = await readHostCatalog();
  const entries = ["a1", "a2"].map((layer) =>
    catalog.packages.find(
      (item) =>
        item.layer === layer &&
        item.valid &&
        (item.origin === "system" || item.origin === "user"),
    ),
  );
  const complete = entries.every(
    (entry) =>
      entry?.packageId &&
      entry.packageVersion &&
      entry.releaseDate &&
      entry.sha256,
  );
  if (!complete) {
    throw new Error("宿主 catalog 未提供完整 A1/A2 launcher 闭包");
  }

  const exact = entries as ExactCatalogEntry[];
  const runtimePackages = await Promise.all(
    exact.map(async (entry) => {
      const pipBytes = new Uint8Array(await readHostPackage(entry));
      const decoded = await decodePip(pipBytes, {
        policy: UNLIMITED_PIP_IO_POLICY,
      });
      return {
        manifest: decoded.manifest,
        pipBytes,
        contentSha256: entry.sha256,
      };
    }),
  );

  return {
    ...source,
    runtimePackages,
    nodeMap: {
      ...source.nodeMap,
      manifest: {
        ...source.nodeMap.manifest,
        launchProfile: {
          schemaVersion: 1,
          loader: packageRef(exact[0]),
          editor: packageRef(exact[1]),
        },
      },
    },
  };
}

const nativeFileName = () => {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "node-map.dmg";
  if (platform.includes("win")) return "node-map.exe";
  return "node-map.AppImage";
};

export async function buildWorkspaceExport(
  workspace: WorkspaceSession,
  source: PortableNodeMap,
  native: boolean,
): Promise<WorkspaceExport> {
  const exportSource = native
    ? await attachNativeLaunchProfile(source)
    : source;
  const bytes = await exportNodeMap(workspace, {
    source: exportSource,
    portable: true,
  });

  if (native) {
    return {
      blob: await exportNativeNodeMap(bytes),
      fileName: nativeFileName(),
      message: "已生成当前平台原生 Node Map",
    };
  }

  return {
    blob: new Blob([Uint8Array.from(bytes).buffer], {
      type: "application/vnd.intent-map.pip",
    }),
    fileName: pipFilename(source.nodeMap.manifest),
    message: "已导出 portable A5 PIP",
  };
}
