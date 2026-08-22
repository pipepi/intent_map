export async function sha256(bytes: Uint8Array) {
  const buffer = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sourceDigest(files: Record<string, Uint8Array>, paths: string[]) {
  const chunks = paths.sort().flatMap((path) => [new TextEncoder().encode(`${path}\0`), files[path] ?? new Uint8Array()]);
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return sha256(joined);
}
