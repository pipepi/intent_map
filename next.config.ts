import type { NextConfig } from "next";
import release from "./pip.release.json";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: process.cwd(),
  generateBuildId: async () => [
    release.intentMap.layer,
    release.intentMap.artifactName,
    release.intentMap.version.replaceAll(".", "_"),
    release.intentMap.releaseDate,
  ].join("_"),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // Self-hosted candidates build in an isolated directory whose node_modules
    // entry points at the audited toolchain. Keep module identities relative to
    // that build root so content hashes do not depend on its absolute path.
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
