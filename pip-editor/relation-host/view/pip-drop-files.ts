/** 浏览器可能不提供 MIME，因此 PIP 文件同时按扩展名和 MIME 识别。 */
export const PIP_MIME = "application/vnd.intent-map.pip";

export const isPipFile = (file: File) =>
  file.name.toLowerCase().endsWith(".pip") || file.type === PIP_MIME;

