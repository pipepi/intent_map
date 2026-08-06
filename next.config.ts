import type { NextConfig } from "next";
import release from "./pip.release.json";

const nextConfig: NextConfig = {
  output: "export",
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
};

export default nextConfig;
