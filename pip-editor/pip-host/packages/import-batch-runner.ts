/** 顺序执行已预检的 PIP 批次；文件间保留成功项，文件内沿用原子回滚。 */
import { selectedPipFilePolicy } from "../../pip-package/io-policy.ts";
import type { PipPackageRef } from "../../pip-package/index.ts";
import {
  updateImportStatus,
  type PipImportBatchState,
  type PreparedPipBatch,
} from "./import-batch.ts";
import {
  importPip,
  type PipImportContext,
  type PipImportResult,
} from "./import-pip.ts";

export type PipImportBatchRunnerOptions = {
  context: () => Omit<
    PipImportContext,
    "fileName" | "ioOptions" | "resolvePackage"
  >;
  onUpdate: (batch: PipImportBatchState) => void;
  resolveInstalled: (
    reference: PipPackageRef,
  ) => Uint8Array | undefined;
};

const resultName = (result: PipImportResult) =>
  result.package instanceof Object && "manifest" in result.package
    ? result.package.manifest.name
    : result.package.nodeMap.manifest.name;

const failureMessage = (error: unknown) =>
  error instanceof Error ? error.message : "PIP 导入失败";

export async function runPreparedPipBatch(
  initial: PipImportBatchState,
  prepared: PreparedPipBatch,
  options: PipImportBatchRunnerOptions,
) {
  let current: PipImportBatchState = {
    ...initial,
    files: prepared.statuses,
  };
  options.onUpdate(current);

  for (const file of prepared.files) {
    current = updateImportStatus(current, file.id, {
      layer: file.layer,
      state: "importing",
      message: "正在校验并导入",
    });
    options.onUpdate(current);

    try {
      const result = await importPip(file.bytes, {
        ...options.context(),
        fileName: file.file.name,
        ioOptions: {
          policy: selectedPipFilePolicy(file.bytes.length),
        },
        resolvePackage: (reference) =>
          prepared.bytesBySha.get(reference.sha256) ??
          options.resolveInstalled(reference),
      });
      current = updateImportStatus(current, file.id, {
        state: "succeeded",
        message: `已导入 ${result.layer.toUpperCase()} ${resultName(result)}`,
      });
    } catch (error) {
      current = updateImportStatus(current, file.id, {
        state: "failed",
        message: failureMessage(error),
      });
    }
    options.onUpdate(current);
  }

  return current;
}

