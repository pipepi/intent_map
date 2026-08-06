import { UNLIMITED_PIP_IO_POLICY } from "../app/runtime/pip-io-policy.ts";

// Repository builds and tests operate on trusted, locally generated inputs.
// User-facing entry points must instead supply CLI/Profile policy or confirmation.
export const trustedBuildPipIo = Object.freeze({
  policy: UNLIMITED_PIP_IO_POLICY,
});
