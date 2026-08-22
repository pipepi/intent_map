type ImmutablePluginManifest = {
  packageId: string;
  packageVersion: string;
  entrySha256: string;
  sourceSha256: string;
};

export function assertSameImmutablePlugin(current: ImmutablePluginManifest, incoming: ImmutablePluginManifest) {
  if (
    current.packageId !== incoming.packageId ||
    current.packageVersion !== incoming.packageVersion ||
    current.entrySha256 !== incoming.entrySha256 ||
    current.sourceSha256 !== incoming.sourceSha256
  ) {
    throw new Error(`PIP ${incoming.packageId} conflicts with installed immutable package ${current.packageId}@${current.packageVersion}`);
  }
}
