/** 将所有文件入口串成同一条宿主级 PIP 导入队列。 */
import { useEffect, useRef, useState } from "react";
import type { PipPackageRef } from "../pip/index.ts";
import {
  createPendingBatch,
  preparePipBatch,
  type PipImportBatchState,
} from "./packages/import-batch.ts";
import { runPreparedPipBatch } from "./packages/import-batch-runner.ts";
import type { PipImportContext } from "./packages/import-pip.ts";

type ImportQueueOptions = {
  context: () => Omit<
    PipImportContext,
    "fileName" | "ioOptions" | "resolvePackage"
  >;
  onMessage: (message: string) => void;
  resolveInstalled: (
    reference: PipPackageRef,
  ) => Uint8Array | undefined;
};

export function usePipImportQueue(options: ImportQueueOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  const sequence = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [importBatch, setImportBatch] = useState<PipImportBatchState>();

  const runBatch = async (batchId: string, files: File[]) => {
    const initial = createPendingBatch(batchId, files);
    setImportBatch(initial);
    const prepared = await preparePipBatch(initial, files);
    const activeOptions = optionsRef.current;
    const current = await runPreparedPipBatch(initial, prepared, {
      context: activeOptions.context,
      onUpdate: setImportBatch,
      resolveInstalled: activeOptions.resolveInstalled,
    });

    const succeeded = current.files.filter(
      (file) => file.state === "succeeded",
    ).length;
    const failed = current.files.filter(
      (file) => file.state === "failed",
    ).length;
    optionsRef.current.onMessage(
      `PIP 导入完成：${succeeded} 成功，${failed} 失败`,
    );
  };

  const installFiles = (input: File[] | FileList) => {
    const files = Array.from(input);
    if (!files.length) return Promise.resolve();
    sequence.current += 1;
    const batchId = `pip-import.${sequence.current}`;
    const task = queue.current
      .catch(() => undefined)
      .then(() => runBatch(batchId, files));
    queue.current = task;
    return task;
  };

  return {
    importBatch,
    installFiles,
  };
}
