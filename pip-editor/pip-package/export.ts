export type ExportResult =
  | {
      ok: true;
      filename: string;
      bytes: Uint8Array;
      byteLength: number;
      sha256: string;
      mimeType: string;
    }
  | { ok: false; filename: string; error: string };

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const copy = Uint8Array.from(bytes);
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer)),
  );
};

export const prepareDocumentExport = async (
  serializedDocument: string,
  filename = "pip-workspace-v3.json",
): Promise<ExportResult> => {
  try {
    const bytes = new TextEncoder().encode(serializedDocument);
    return {
      ok: true,
      filename,
      bytes,
      byteLength: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      mimeType: "application/json",
    };
  } catch (error) {
    return {
      ok: false,
      filename,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const downloadExport = (result: Extract<ExportResult, { ok: true }>) => {
  const blob = new Blob([result.bytes as BlobPart], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
};
