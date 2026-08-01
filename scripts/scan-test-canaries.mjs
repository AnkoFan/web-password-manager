import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_MARKERS = [
  "M3-TEST-ONLY-MASTER-PASSWORD-7e5f",
  "M3-TEST-ONLY-FIELD-SECRET-2a91",
  "M3-TEST-ONLY-TOKEN-4c83",
];

function parseArguments(argv) {
  const roots = [];
  const markers = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) {
      roots.push(path.resolve(argv[++index]));
    } else if (argv[index] === "--marker" && argv[index + 1]) {
      markers.push(argv[++index]);
    } else {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
  }
  if (roots.length === 0) {
    throw new Error("At least one --root directory is required.");
  }
  return { roots, markers: markers.length > 0 ? markers : DEFAULT_MARKERS };
}

async function* filesUnder(root) {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink()) return;
  if (metadata.isFile()) {
    yield root;
    return;
  }
  if (!metadata.isDirectory()) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      yield* filesUnder(child);
    } else if (entry.isFile()) {
      yield child;
    }
  }
}

async function containsAnyMarker(file, markerBuffers, overlapLength) {
  let overlap = Buffer.alloc(0);
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    const searchable = overlap.length > 0 ? Buffer.concat([overlap, chunk]) : chunk;
    if (markerBuffers.some((marker) => searchable.indexOf(marker) !== -1)) {
      return true;
    }
    overlap = searchable.subarray(Math.max(0, searchable.length - overlapLength));
  }
  return false;
}

const { roots, markers } = parseArguments(process.argv.slice(2));
const markerBuffers = markers.flatMap((marker) => [
  Buffer.from(marker, "utf8"),
  Buffer.from(marker, "utf16le"),
]);
const overlapLength = Math.max(...markerBuffers.map((marker) => marker.length)) - 1;
const matches = [];
let filesScanned = 0;

for (const root of roots) {
  for await (const file of filesUnder(root)) {
    filesScanned += 1;
    if (await containsAnyMarker(file, markerBuffers, overlapLength)) {
      matches.push(file);
    }
  }
}

const result = {
  testData: "Only caller-supplied or fixed M3-TEST-ONLY canary strings are searched.",
  roots,
  markers,
  filesScanned,
  matches,
  passed: matches.length === 0,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.passed ? 0 : 2;
