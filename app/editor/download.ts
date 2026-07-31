// ============================================================================
// 浏览器下载工具（page.tsx 拆出）
// ============================================================================

/** 触发浏览器下载：把字节包装成 Blob 并模拟点击下载链接。 */
export const downloadBytes = (name: string, bytes: Uint8Array, type: string) => {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
