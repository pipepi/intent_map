type ImmutablePluginManifest = {
  id: string;
  version: string;
  entrySha256: string;
  sourceSha256: string;
};

export function assertSameImmutablePlugin(current: ImmutablePluginManifest, incoming: ImmutablePluginManifest) {
  if (
    current.id !== incoming.id ||
    current.version !== incoming.version ||
    current.entrySha256 !== incoming.entrySha256 ||
    current.sourceSha256 !== incoming.sourceSha256
  ) {
    throw new Error(`Plugin ${incoming.id} conflicts with installed immutable package ${current.id}@${current.version}`);
  }
}
