/** TEST 12 - no admin on the program surface: runs tests/idl-authority.ts (source + IDL when built). */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("12. IDL / source has no admin", () => {
  it("tests/idl-authority.ts passes", () => {
    const root = resolve(import.meta.dirname, "../..");
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "tests/idl-authority.ts"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /idl-authority PASS/);
  });
});
