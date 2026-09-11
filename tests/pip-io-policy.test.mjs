import assert from "node:assert/strict";
import test from "node:test";

import {
  ASK_PIP_IO_POLICY,
  UNLIMITED_PIP_IO_POLICY,
  assertPipIoPolicy,
  evaluatePipLimit,
  pipLimit,
  selectedPipFilePolicy,
  resolvePipIoPolicy,
} from "../pip-editor/pip-package/io-policy.ts";

test("PIP I/O policy defaults every metric to an explicit confirmation", () => {
  assertPipIoPolicy(ASK_PIP_IO_POLICY);
  for (const [field, limit] of Object.entries(ASK_PIP_IO_POLICY)) {
    if (field !== "schemaVersion") assert.equal(limit.mode, "ask");
  }
});

test("unlimited policy is available only as an explicit caller choice", () => {
  assertPipIoPolicy(UNLIMITED_PIP_IO_POLICY);
  for (const [field, limit] of Object.entries(UNLIMITED_PIP_IO_POLICY)) {
    if (field !== "schemaVersion") assert.equal(limit.mode, "unlimited");
  }
});

test("an explicitly selected PIP file produces a finite per-file policy", () => {
  assert.deepEqual(selectedPipFilePolicy(153679), {
    schemaVersion: 1,
    maxPipBytes: pipLimit(153679),
    maxSingleResourceBytes: pipLimit(153679),
    maxExpandedBytes: pipLimit(153679),
    maxResourceCount: pipLimit(153679),
    maxCompressionRatio: pipLimit(1),
  });
});

test("PIP I/O policy resolves every field by CLI, session, profile, package, then default", () => {
  const result = resolvePipIoPolicy({
    package: {
      maxPipBytes: pipLimit(10),
      maxSingleResourceBytes: pipLimit(20),
      maxExpandedBytes: pipLimit(30),
      maxResourceCount: pipLimit(40),
    },
    profile: {
      maxPipBytes: pipLimit(11),
      maxSingleResourceBytes: pipLimit(21),
      maxExpandedBytes: pipLimit(31),
    },
    session: {
      maxPipBytes: pipLimit(12),
      maxSingleResourceBytes: pipLimit(22),
    },
    cli: { maxPipBytes: pipLimit(13) },
  });

  assert.deepEqual(result.policy.maxPipBytes, pipLimit(13));
  assert.deepEqual(result.policy.maxSingleResourceBytes, pipLimit(22));
  assert.deepEqual(result.policy.maxExpandedBytes, pipLimit(31));
  assert.deepEqual(result.policy.maxResourceCount, pipLimit(40));
  assert.equal(result.policy.maxCompressionRatio.mode, "ask");
  assert.deepEqual(result.sources, {
    maxPipBytes: "cli",
    maxSingleResourceBytes: "session",
    maxExpandedBytes: "profile",
    maxResourceCount: "package",
    maxCompressionRatio: "default",
  });
});

test("PIP limits distinguish allow, confirmation, and denial without fixed byte constants", () => {
  assert.deepEqual(evaluatePipLimit({ mode: "unlimited" }, 999999999999n), {
    outcome: "allow",
  });
  assert.deepEqual(evaluatePipLimit({ mode: "ask" }, 1), { outcome: "confirm" });
  assert.deepEqual(evaluatePipLimit(pipLimit(8), 8), { outcome: "allow" });
  assert.deepEqual(evaluatePipLimit(pipLimit(8), 9), {
    outcome: "deny",
    actual: "9",
    maximum: "8",
  });
});

test("PIP policy rejects unsafe or ambiguous numeric values", () => {
  assert.throws(() => pipLimit(-1), /negative/);
  assert.throws(
    () => assertPipIoPolicy({ ...ASK_PIP_IO_POLICY, maxPipBytes: { mode: "value", value: "01" } }),
    /decimal string/,
  );
  assert.throws(
    () => assertPipIoPolicy({ ...ASK_PIP_IO_POLICY, maxPipBytes: { mode: "unlimited", value: "1" } }),
    /must not include/,
  );
});
