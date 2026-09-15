import assert from "node:assert/strict";
import test from "node:test";
import { validatePublicAuthKey } from "../src/lib/auth-config";

test("masked, truncated and non-ASCII Supabase keys fail safely before fetch", () => {
  for (const key of [undefined, "", "sb_publishable_abc\u2026", "\u2022\u2022\u2022", "\u201ckey\u201d", "key\nvalue", "sb_publishable_...", "sb_secret_private", " key "]) {
    assert.throws(() => validatePublicAuthKey(key), /full Supabase public key/);
  }
  assert.doesNotThrow(() => validatePublicAuthKey("sb_publishable_valid_key"));
  assert.doesNotThrow(() => validatePublicAuthKey("eyJhbGciOiJIUzI1NiJ9.payload.signature"));
});
