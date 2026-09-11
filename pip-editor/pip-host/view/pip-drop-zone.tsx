/** 为宿主与工作区画布提供一致的 PIP 文件拖放事件所有权。 */
import {
  forwardRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
} from "react";
import type { WorkspacePoint } from "../contracts/package-types.ts";
import { isPipFile } from "./pip-drop-files.ts";
import styles from "./pip-drop-zone.module.css";

type PipDropZoneProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop"
> & {
  onPipFiles: (files: File[], point: WorkspacePoint) => void;
  onUnsupportedFiles: (files: File[]) => void;
  pointFromScreen: (screen: WorkspacePoint) => WorkspacePoint;
};

const ownsEvent = (event: DragEvent<HTMLDivElement>) => {
  const target = event.target;
  return target instanceof Element &&
    target.closest("[data-pip-drop-target]") === event.currentTarget;
};

const carriesFiles = (event: DragEvent<HTMLDivElement>) =>
  event.dataTransfer.types.includes("Files");

export const PipDropZone = forwardRef<HTMLDivElement, PipDropZoneProps>(
  function PipDropZone({
    children,
    className,
    onPipFiles,
    onUnsupportedFiles,
    pointFromScreen,
    ...props
  }, ref) {
    const [active, setActive] = useState(false);

    const consume = (event: DragEvent<HTMLDivElement>) => {
      if (!ownsEvent(event) || !carriesFiles(event)) return false;
      event.preventDefault();
      // 嵌套工作区消费文件拖放，宿主画布不能再次处理同一个批次。
      event.stopPropagation();
      return true;
    };

    return <div
      {...props}
      ref={ref}
      data-pip-drop-target
      className={`${className ?? ""} ${styles.dropZone}`}
      onDragEnter={(event) => {
        if (consume(event)) setActive(true);
      }}
      onDragLeave={(event) => {
        if (!ownsEvent(event)) return;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setActive(false);
        }
      }}
      onDragOver={(event) => {
        if (!consume(event)) return;
        event.dataTransfer.dropEffect = "copy";
        setActive(true);
      }}
      onDrop={(event) => {
        if (!consume(event)) return;
        setActive(false);
        const files = Array.from(event.dataTransfer.files);
        const pipFiles = files.filter(isPipFile);
        if (!pipFiles.length) {
          onUnsupportedFiles(files);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const screen = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        onPipFiles(pipFiles, pointFromScreen(screen));
      }}
    >
      {children}
      {active && <div className={styles.dropHint} aria-hidden="true">
        释放以导入 PIP
      </div>}
    </div>;
  },
);
