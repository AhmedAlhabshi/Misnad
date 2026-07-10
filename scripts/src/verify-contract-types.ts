import {
  CONTRACT_TYPES,
  isContractType,
} from "@workspace/contract-types";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (CONTRACT_TYPES.length !== 9) {
  fail(`expected exactly 9 contract types, got ${CONTRACT_TYPES.length}`);
}

const seen = new Set<string>();
for (const t of CONTRACT_TYPES) {
  if (seen.has(t.value)) {
    fail(`duplicate contract type value: ${t.value}`);
  }
  seen.add(t.value);

  if (!t.labelAr) {
    fail(`missing labelAr for ${t.value}`);
  }
  if (!t.labelEn) {
    fail(`missing labelEn for ${t.value}`);
  }
}

if (isContractType("auto_finance") !== true) {
  fail('isContractType("auto_finance") should return true');
}

if (isContractType("invalid_type") !== false) {
  fail('isContractType("invalid_type") should return false');
}

console.log("OK: contract-types verification passed");
console.log(`  - ${CONTRACT_TYPES.length} contract types`);
console.log(`  - no duplicate values`);
console.log(`  - all have labelAr and labelEn`);
console.log(`  - isContractType("auto_finance") -> true`);
console.log(`  - isContractType("invalid_type") -> false`);
