import {
  decodePip,
  encodePip,
  type PipIoOptions,
  type PipPackage,
} from "../index.ts";
import {
  PIP_WORKSPACE_INDEX_PATH,
  readWorkspaceResourceIndex,
  verifyWorkspaceResources,
  workspaceResourceIndexAsset,
  type WorkspaceResource,
  type WorkspaceResourceIndex,
} from "../workspace/resource-index.ts";
import type { WorkspaceResourceSession } from "../workspace/resource-store.ts";

export const bundleSplitWorkspace = async (
  pip: PipPackage,
  session: WorkspaceResourceSession,
  options: PipIoOptions,
): Promise<Uint8Array> => {
  const resources: WorkspaceResource[] = [];
  for (const entry of session.list()) resources.push(await session.read(entry.path));
  return encodePip(
    {
      ...pip,
      assets: [
        workspaceResourceIndexAsset(session.index),
        ...resources.map((resource) => ({
          path: resource.path,
          mime: resource.mediaType,
          bytes: resource.bytes,
        })),
      ],
    },
    options,
  );
};

export type UnpackedWorkspaceBundle = {
  intentPip: Uint8Array;
  resources: WorkspaceResource[];
  index: WorkspaceResourceIndex;
};

export const unpackWorkspaceBundle = async (
  bundle: ArrayBuffer | Uint8Array,
  options: PipIoOptions,
): Promise<UnpackedWorkspaceBundle> => {
  const pip = await decodePip(bundle, options);
  const index = readWorkspaceResourceIndex(pip);
  if (!index) throw new Error("Bundle has no split workspace resource index");
  const resources = pip.assets
    .filter((asset) => asset.path !== PIP_WORKSPACE_INDEX_PATH)
    .map((asset) => ({ path: asset.path, mediaType: asset.mime, bytes: asset.bytes.slice() }));
  await verifyWorkspaceResources(index, resources);
  const intentPip = await encodePip(
    { ...pip, assets: [workspaceResourceIndexAsset(index)] },
    options,
  );
  return { intentPip, resources, index };
};
