import path from "node:path";

import { streamUnbundleNodeWorkspace } from "../pip-editor/pip-package/bundle/node-streaming-unbundle.ts";
import { pipIoOptionsFromArgs } from "./pip-io-cli.mjs";

const [bundleArgument, outputArgument] = process.argv.slice(2);
if (!bundleArgument || !outputArgument || bundleArgument.startsWith("--") || outputArgument.startsWith("--")) {
  throw new Error(
    "Usage: npm run pip:workspace:unbundle -- <versioned-bundle.pip> <new-workspace-directory> [PIP limit options]",
  );
}

const result = await streamUnbundleNodeWorkspace({
  bundle: path.resolve(bundleArgument),
  destination: path.resolve(outputArgument),
  options: pipIoOptionsFromArgs(process.argv.slice(2)),
});
process.stdout.write(
  `${result.path}\nintent.pip · ${result.intentPipBytes} bytes\nresources/ · ${result.resourceCount} files\n`,
);
