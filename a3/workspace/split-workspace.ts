import {
  decodePip,
  encodePip,
  type PipIoOptions,
  type PipPackage,
} from "../../app/runtime/pip.ts";
import {
  createWorkspaceResourceIndex,
  PIP_WORKSPACE_INDEX_PATH,
  workspaceResourceIndexAsset,
  type WorkspaceResource,
  type WorkspaceResourceIndex,
} from "./resource-index.ts";
import {
  openWorkspaceResourceSession,
  type WorkspaceResourceSession,
  type WorkspaceResourceStore,
} from "./resource-store.ts";

export type SplitWorkspaceExport = {
  intentPip: Uint8Array;
  resources: WorkspaceResource[];
  index: WorkspaceResourceIndex;
};

const externalResources = (pip: PipPackage): WorkspaceResource[] => pip.assets
  .filter((asset) => asset.path !== PIP_WORKSPACE_INDEX_PATH)
  .map((asset) => ({
    path: asset.path,
    mediaType: asset.mime,
    bytes: asset.bytes.slice(),
  }));

export const splitPipWorkspace = async (
  pip: PipPackage,
  options: PipIoOptions,
): Promise<SplitWorkspaceExport> => {
  const resources = externalResources(pip);
  const index = await createWorkspaceResourceIndex(resources);
  const intentPip = await encodePip(
    {
      ...pip,
      assets: [workspaceResourceIndexAsset(index)],
    },
    options,
  );
  return { intentPip, resources, index };
};

export type OpenedSplitWorkspace = {
  pip: PipPackage;
  resources: WorkspaceResourceSession;
};

export const openSplitWorkspace = async (
  intentPip: ArrayBuffer | Uint8Array,
  store: WorkspaceResourceStore,
  options: PipIoOptions,
): Promise<OpenedSplitWorkspace> => {
  const pip = await decodePip(intentPip, options);
  return {
    pip,
    resources: openWorkspaceResourceSession(pip, store),
  };
};

export const saveSplitWorkspaceIntent = async (
  pip: PipPackage,
  index: WorkspaceResourceIndex,
  options: PipIoOptions,
): Promise<Uint8Array> => encodePip(
  { ...pip, assets: [workspaceResourceIndexAsset(index)] },
  options,
);
