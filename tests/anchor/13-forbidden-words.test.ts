/** TEST 13 - honesty of the copy: runs tests/forbidden-words.ts over app, sdk, config, docs. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

describe("13. forbidden words", () => {
  it("tests/forbidden-words.ts passes", () => {
    const root = resolve(import.meta.dirname, "../..");
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "tests/forbidden-words.ts"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /forbidden-words PASS/);
  });
});
