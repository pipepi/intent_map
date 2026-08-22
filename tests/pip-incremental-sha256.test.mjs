import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { IncrementalSha256 } from "../pip-editor/pip/bundle/incremental-sha256.ts";

const hex = (bytes) => Buffer.from(bytes).toString("hex");

test("incremental SHA-256 matches standard vectors", () => {
  assert.equal(
    hex(new IncrementalSha256().digest()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    hex(new IncrementalSha256().update(new TextEncoder().encode("abc")).digest()),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("incremental SHA-256 is independent of stream chunk boundaries", () => {
  const bytes = Uint8Array.from({ length: 1024 * 1024 + 137 }, (_, index) => index * 31 + 7);
  const expected = createHash("sha256").update(bytes).digest("hex");
  for (const chunkSize of [1, 7, 63, 64, 65, 4093, bytes.byteLength]) {
    const hash = new IncrementalSha256();
    for (let cursor = 0; cursor < bytes.byteLength; cursor += chunkSize) {
      hash.update(bytes.subarray(cursor, cursor + chunkSize));
    }
    assert.equal(hex(hash.digest()), expected, `chunk size ${chunkSize}`);
  }
});

test("incremental SHA-256 cannot be reused after finalization", () => {
  const hash = new IncrementalSha256();
  hash.digest();
  assert.throws(() => hash.update(new Uint8Array([1])), /already finalized/);
  assert.throws(() => hash.digest(), /already finalized/);
});
