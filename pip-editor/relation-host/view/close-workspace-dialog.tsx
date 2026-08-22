import styles from "./relation-host.module.css";

export function CloseWorkspaceDialog({ name, onExport, onDiscard, onCancel }: {
  name: string; onExport: () => void; onDiscard: () => void; onCancel: () => void;
}) {
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.closeDialog} role="dialog" aria-modal="true" aria-label="关闭工作区">
    <h2>关闭“{name}”？</h2><p>RelationGraph 有尚未导出的修改。相机、选择与窗口布局不会触发此提示。</p>
    <div><button onClick={onCancel}>取消</button><button onClick={onDiscard}>放弃并关闭</button><button className={styles.primary} onClick={onExport}>导出 A5 并关闭</button></div>
  </section></div>;
}
