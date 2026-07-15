import assert from "node:assert/strict";
import { decodeUploadedFileName } from "../analyzeContract";

export function run(): void {
  assert.equal(decodeUploadedFileName("lease-agreement.pdf"), "lease-agreement.pdf", "pure-ASCII names are unchanged");
  console.log("PASS decodeUploadedFileName leaves ASCII file names unchanged");

  const original = "عقد الإيجار.pdf";
  const misDecodedAsLatin1 = Buffer.from(original, "utf8").toString("latin1");
  assert.equal(
    decodeUploadedFileName(misDecodedAsLatin1),
    original,
    "re-decoding recovers the original UTF-8 file name from Busboy's Latin-1 mis-decode",
  );
  console.log("PASS decodeUploadedFileName recovers a mis-decoded Arabic file name");

  const alreadyCorrectUtf8 = "Toyota Camry — عقد.pdf";
  assert.equal(
    decodeUploadedFileName(alreadyCorrectUtf8),
    alreadyCorrectUtf8,
    "re-decoding an already-correct string must not introduce new corruption",
  );
  console.log("PASS decodeUploadedFileName never corrupts an already-correct name");

  console.log("PASS analyzeContract.fileName.test.ts");
}

run();
