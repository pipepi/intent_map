/** 显示当前会话中的最近一次 PIP 导入批次，不持久化到系统节点。 */
import type { PipImportBatchState } from "../../pip-host/packages/import-batch.ts";
import styles from "./import-status.module.css";

type ImportStatusProps = {
  batch?: PipImportBatchState;
};

const stateLabel = {
  pending: "等待",
  importing: "导入中",
  succeeded: "成功",
  failed: "失败",
} as const;

export function PluginImportStatus({ batch }: ImportStatusProps) {
  if (!batch) return null;
  const completed = batch.files.filter(
    (file) => ["succeeded", "failed"].includes(file.state),
  ).length;

  return <section className={styles.importStatus} aria-live="polite">
    <header>
      <h3>导入进度</h3>
      <span>{completed}/{batch.files.length}</span>
    </header>
    <ol>
      {batch.files.map((file) => <li
        key={file.id}
        className={styles[file.state]}
      >
        <div>
          <strong>{file.fileName}</strong>
          <span>{file.layer?.toUpperCase() ?? "PIP"}</span>
          <span>{stateLabel[file.state]}</span>
        </div>
        {file.message && <p>{file.message}</p>}
      </li>)}
    </ol>
  </section>;
}

