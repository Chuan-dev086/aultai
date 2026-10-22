import assert from "node:assert/strict";
import { after, test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "aultai-upload-test-"));
process.env.WORKSPACE_DIR = workspaceDir;
const { uploadProject } = await import("../src/services/projectManager.js");

after(async () => {
  await fs.rm(workspaceDir, { recursive: true, force: true });
  delete process.env.WORKSPACE_DIR;
});

test("promotes a nested project folder and rejects ambiguous project roots", async () => {
  const archivePath = path.join(workspaceDir, "nested-project.zip");
  await fs.writeFile(
    archivePath,
    createZip([
      ["aultai-main/README.md", "# Wrapper"],
      ["aultai-main/aultai/package.json", '{"name":"aultai"}'],
      ["aultai-main/aultai/packages/backend/package.json", '{"name":"backend"}'],
    ]),
  );

  await uploadProject(archivePath);

  const projectRoot = path.join(workspaceDir, "dynamic_project");
  assert.equal(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"), '{"name":"aultai"}');
  assert.equal(await fs.readFile(path.join(projectRoot, "packages", "backend", "package.json"), "utf8"), '{"name":"backend"}');
  assert.equal(await fs.readdir(projectRoot).then((entries) => entries.includes("aultai-main")), false);

  await fs.writeFile(
    archivePath,
    createZip([
      ["first/package.json", '{"name":"first"}'],
      ["second/package.json", '{"name":"second"}'],
    ]),
  );
  await assert.rejects(
    uploadProject(archivePath),
    (err) => err.code === "UPLOAD_FAILED" && err.message.includes("multiple project folders"),
  );
});

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [filePath, contents] of files) {
    const name = Buffer.from(filePath);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
