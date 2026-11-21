"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const manager = require("./workspace-manager");

const validId = "9f7c2a10-4d61-4c92-9a31-0c4b8a2d7e55";

test("accepts a canonical random UUID workspace identifier", () => {
  assert.equal(manager.validWorkspaceId(validId), true);
});

test("rejects malformed identifiers before they can become Docker names", () => {
  for (const value of ["", "../root", "not-a-uuid", "9f7c2a10-4d61-4c92-9a31-0c4b8a2d7e5", null, 42]) {
    assert.equal(manager.validWorkspaceId(value), false);
  }
});

test("derives deterministic container and volume names", () => {
  assert.equal(manager.resourceName("owl-", validId), "owl-9f7c2a104d614c929a310c4b8a2d7e55");
  assert.equal(manager.resourceName("owl-data-", validId), "owl-data-9f7c2a104d614c929a310c4b8a2d7e55");
});

test("refuses to derive resource names from untrusted identifiers", () => {
  assert.throws(() => manager.resourceName("owl-", "../../etc"), /Invalid workspace identifier/);
});

test("exports the complete workspace lifecycle API", () => {
  for (const name of ["listWorkspaces", "getWorkspace", "startWorkspace", "stopWorkspace", "deleteWorkspace"]) {
    assert.equal(typeof manager[name], "function");
  }
});
