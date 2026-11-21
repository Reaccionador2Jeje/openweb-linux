"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const LABEL_MANAGED = "com.openweb-linux.managed";
const LABEL_WORKSPACE = "com.openweb-linux.workspace";

function validWorkspaceId(value) {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
}

function resourceName(prefix, workspaceId) {
  if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace identifier.");
  return prefix + workspaceId.replaceAll("-", "").toLowerCase();
}

async function docker(args, timeout = 20000) {
  const { stdout } = await execFileAsync("docker", args, {
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  return stdout.trim();
}

async function listWorkspaces() {
  const raw = await docker([
    "ps", "-a",
    "--filter", "label=" + LABEL_MANAGED + "=true",
    "--format", "{{.ID}}\t{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Label \"" + LABEL_WORKSPACE + "\"}}"
  ]);
  if (!raw) return [];
  return raw.split("\n").map(line => {
    const [id, name, state, status, workspaceId] = line.split("\t");
    return { id, name, state, status, workspaceId };
  }).filter(item => validWorkspaceId(item.workspaceId));
}

async function getWorkspace(workspaceId) {
  if (!validWorkspaceId(workspaceId)) throw new Error("Invalid workspace identifier.");
  const name = resourceName("owl-", workspaceId);
  const raw = await docker([
    "inspect", "--format",
    "{{.Id}}|{{.State.Status}}|{{.State.Running}}|{{.Config.Image}}|{{.Created}}",
    name
  ]);
  const [id, state, running, image, createdAt] = raw.split("|");
  const labels = await docker([
    "inspect", "--format",
    "{{ index .Config.Labels \"" + LABEL_MANAGED + "\" }}|{{ index .Config.Labels \"" + LABEL_WORKSPACE + "\" }}",
    name
  ]);
  const [managed, labelId] = labels.split("|");
  if (managed !== "true" || labelId !== workspaceId) {
    throw new Error("Workspace not found or not managed by OpenWeb Linux.");
  }
  return { id, workspaceId, name, state, running: running === "true", image, createdAt };
}

async function startWorkspace(workspaceId) {
  const item = await getWorkspace(workspaceId);
  if (!item.running) await docker(["start", item.name]);
  return getWorkspace(workspaceId);
}

async function stopWorkspace(workspaceId) {
  const item = await getWorkspace(workspaceId);
  if (item.running) await docker(["stop", "--time", "5", item.name], 15000);
  return getWorkspace(workspaceId);
}

async function deleteWorkspace(workspaceId) {
  const item = await getWorkspace(workspaceId);
  await docker(["rm", "--force", item.name]);
  const volume = resourceName("owl-data-", workspaceId);
  await docker(["volume", "rm", volume]);
  return { workspaceId, deleted: true };
}

module.exports = {
  validWorkspaceId,
  resourceName,
  listWorkspaces,
  getWorkspace,
  startWorkspace,
  stopWorkspace,
  deleteWorkspace
};
