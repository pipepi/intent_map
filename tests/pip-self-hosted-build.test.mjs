import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (script, ...args) => spawnSync(
  process.execPath,
  [path.join(root, "scripts", script), ...args],
  { cwd: root, encoding: "utf8" },
);

test("self-hosted source builds isolated a0 through a2 candidates with a receipt", async (context) => {
  const temporary = await mkdtemp(path.join(root, ".pip-self-build-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = path.join(temporary, "source");
  const candidates = path.join(temporary, "candidates");
  const repeatedCandidates = path.join(temporary, "candidates-repeated");
  const extracted = run("extract-system-sources.mjs", source);
  assert.equal(extracted.status, 0, extracted.stderr);
  await appendFile(path.join(source, "pip-editor", "pip", "patch.ts"), "\n// Candidate self-hosting edit.\n");
  const unsealed = run("build-self-hosted-candidates.mjs", source, candidates);
  assert.notEqual(unsealed.status, 0);
  assert.match(unsealed.stderr, /no longer matches its receipt/);
  const sealed = run("seal-self-hosting-source.mjs", source);
  assert.equal(sealed.status, 0, sealed.stderr);
  const built = run("build-self-hosted-candidates.mjs", source, candidates);
  assert.equal(built.status, 0, built.stderr);
  const receiptText = await readFile(path.join(candidates, "self-hosting-build-receipt.json"), "utf8");
  const receipt = JSON.parse(receiptText);
  assert.equal(receipt.kind, "pip-self-hosting-build/1");
  assert.match(receipt.sourceTreeSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.artifacts.length, 3);
  assert.deepEqual(
    receipt.artifacts.map(({ file }) => file.match(/pip-seed\/repo\/system\/(a[0-2])\//)?.[1]),
    ["a0", "a1", "a2"],
  );
  for (const artifact of receipt.artifacts) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(artifact.bytes > 0);
    const candidateBytes = await readFile(path.join(candidates, artifact.file));
    assert.equal(candidateBytes.length, artifact.bytes);
    assert.equal(sha256(candidateBytes), artifact.sha256, artifact.file);
  }
  const repeated = run("build-self-hosted-candidates.mjs", source, repeatedCandidates);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(
    await readFile(path.join(repeatedCandidates, "self-hosting-build-receipt.json"), "utf8"),
    receiptText,
  );
  const rejected = run("build-self-hosted-candidates.mjs", source, candidates);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Candidate destination already exists/);
});
