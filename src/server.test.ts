import { test } from "node:test";
import assert from "node:assert/strict";
import { sniff } from "./server.ts";

test("sniff detects allowed types from magic bytes and rejects the rest", () => {
  assert.equal(sniff(Buffer.from("89504e470d0a1a0a0000", "hex")), "png");
  assert.equal(sniff(Buffer.from("ffd8ffe0", "hex")), "jpg");
  assert.equal(sniff(Buffer.from("GIF89a....")), "gif");
  assert.equal(sniff(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "webp");
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniff(Buffer.from("<html><script>")), null);
  assert.equal(sniff(Buffer.alloc(0)), null);
});
