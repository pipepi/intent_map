import {
  ASK_PIP_IO_POLICY,
  UNLIMITED_PIP_IO_POLICY,
} from "../pip-editor/pip-package/io-policy.ts";

export const packagedPipIoPolicy = ASK_PIP_IO_POLICY;

// Repository builds and tests operate on trusted, locally generated inputs.
// User-facing entry points must instead supply CLI/Profile policy or confirmation.
export const trustedBuildPipIo = Object.freeze({
  policy: UNLIMITED_PIP_IO_POLICY,
});
