/** PIP 批量导入的预检、排序与界面状态模型。 */
import {
  decodePip,
  pipFilename,
  pipSha256,
} from "../../pip/index.ts";
import { selectedPipFilePolicy } from "../../pip/io-policy.ts";

export type ImportablePipLayer = "a3" | "a4" | "a5";
export type PipImportFileState =
  | "pending"
  | "importing"
  | "succeeded"
  | "failed";

export type PipImportFileStatus = {
  id: string;
  fileName: string;
  layer?: ImportablePipLayer;
  state: PipImportFileState;
  message?: string;
};

export type PipImportBatchState = {
  id: string;
  files: PipImportFileStatus[];
};

export type PreparedPipFile = {
  bytes: Uint8Array;
  file: File;
  id: string;
  index: number;
  layer: ImportablePipLayer;
  sha256: string;
};

export type PreparedPipBatch = {
  bytesBySha: Map<string, Uint8Array>;
  files: PreparedPipFile[];
  statuses: PipImportFileStatus[];
};

const layerOrder: Record<ImportablePipLayer, number> = {
  a3: 3,
  a4: 4,
  a5: 5,
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "PIP 预检失败";

export const createPendingBatch = (
  id: string,
  files: File[],
): PipImportBatchState => ({
  id,
  files: files.map((file, index) => ({
    id: `${id}.${index}`,
    fileName: file.name,
    state: "pending",
  })),
});

/**
 * 预检先建立整批 SHA 解析表，之后 thin A4/A5 可以引用同批中的精确依赖。
 * 单个文件预检失败只记录自身错误，不阻断其他文件。
 */
export async function preparePipBatch(
  batch: PipImportBatchState,
  files: File[],
): Promise<PreparedPipBatch> {
  const prepared: PreparedPipFile[] = [];
  const statuses = structuredClone(batch.files);

  for (const [index, file] of files.entries()) {
    const status = statuses[index];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ioOptions = {
        policy: selectedPipFilePolicy(bytes.length),
      };
      const pip = await decodePip(bytes, ioOptions);
      if (!["a3", "a4", "a5"].includes(pip.manifest.layer)) {
        throw new Error(`编辑器不能导入 ${pip.manifest.layer} PIP`);
      }
      if (file.name !== pipFilename(pip.manifest)) {
        throw new Error(
          `PIP filename does not match manifest: expected ${pipFilename(
            pip.manifest,
          )}`,
        );
      }
      const layer = pip.manifest.layer as ImportablePipLayer;
      status.layer = layer;
      prepared.push({
        bytes,
        file,
        id: status.id,
        index,
        layer,
        sha256: await pipSha256(bytes),
      });
    } catch (error) {
      status.state = "failed";
      status.message = errorMessage(error);
    }
  }

  prepared.sort((left, right) =>
    layerOrder[left.layer] - layerOrder[right.layer] ||
    left.index - right.index,
  );

  return {
    bytesBySha: new Map(
      prepared.map((item) => [item.sha256, item.bytes]),
    ),
    files: prepared,
    statuses,
  };
}

export const updateImportStatus = (
  batch: PipImportBatchState,
  fileId: string,
  update: Partial<Omit<PipImportFileStatus, "id" | "fileName">>,
): PipImportBatchState => ({
  ...batch,
  files: batch.files.map((file) =>
    file.id === fileId ? { ...file, ...update } : file),
});

