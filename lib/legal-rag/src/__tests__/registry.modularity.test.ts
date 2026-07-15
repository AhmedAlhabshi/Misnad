import assert from "node:assert/strict";
import { CONTRACT_TYPE_VALUES } from "@workspace/contract-types";
import { LEGAL_COLLECTIONS } from "../registry/collections";
import { CONTRACT_TYPE_LEGAL_REGISTRY, getContractTypeLegalConfig, type ContractTypeLegalConfig } from "../registry/contractTypeRegistry";

export function run(): void {
  // --- Every currently supported contract type has an entry ---
  {
    for (const contractType of CONTRACT_TYPE_VALUES) {
      const entry = CONTRACT_TYPE_LEGAL_REGISTRY[contractType];
      assert.ok(entry, `contract type "${contractType}" must have a registry entry`);
      assert.equal(typeof entry.enabled, "boolean");
      assert.ok(Array.isArray(entry.preferredCollections));
      assert.ok(Array.isArray(entry.fallbackCollections));
      assert.ok(Array.isArray(entry.supportedTopics));
    }
  }
  console.log("PASS every currently supported contract type has a registry entry");

  // --- auto_finance/personal_finance route to the SAMA collections that actually have ingested data ---
  {
    assert.ok(CONTRACT_TYPE_LEGAL_REGISTRY.auto_finance.preferredCollections.includes(LEGAL_COLLECTIONS.SAMA_CONSUMER_FINANCE));
    assert.ok(CONTRACT_TYPE_LEGAL_REGISTRY.auto_finance.preferredCollections.includes(LEGAL_COLLECTIONS.SAMA_APR));
    assert.ok(CONTRACT_TYPE_LEGAL_REGISTRY.personal_finance.preferredCollections.includes(LEGAL_COLLECTIONS.SAMA_CONSUMER_FINANCE));
  }
  console.log("PASS auto_finance and personal_finance route to the populated SAMA collections");

  // --- "other" never forces a sector-specific collection, and has no forced supportedTopics ---
  {
    assert.deepEqual(CONTRACT_TYPE_LEGAL_REGISTRY.other.preferredCollections, [LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS]);
    assert.deepEqual(CONTRACT_TYPE_LEGAL_REGISTRY.other.fallbackCollections, []);
    assert.deepEqual(CONTRACT_TYPE_LEGAL_REGISTRY.other.supportedTopics, []);
  }
  console.log("PASS 'other' only searches the civil-transactions fallback and forces no sector-specific collection");

  // --- Sector-specific (preferred) collections come before the civil-transactions fallback for a sector type ---
  {
    assert.ok(!CONTRACT_TYPE_LEGAL_REGISTRY.employment.preferredCollections.includes(LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS));
    assert.ok(CONTRACT_TYPE_LEGAL_REGISTRY.employment.fallbackCollections.includes(LEGAL_COLLECTIONS.CIVIL_TRANSACTIONS));
  }
  console.log("PASS a sector-specific contract type never puts civil_transactions in its preferred list, only fallback");

  // --- Modularity: removing one contract type's entry must not affect any other entry's config ---
  {
    const clonedRegistry: Record<string, ContractTypeLegalConfig> = { ...CONTRACT_TYPE_LEGAL_REGISTRY };
    const beforeAutoFinance = JSON.stringify(clonedRegistry.auto_finance);
    const beforeLease = JSON.stringify(clonedRegistry.lease);

    delete clonedRegistry.employment;

    assert.equal(JSON.stringify(clonedRegistry.auto_finance), beforeAutoFinance, "removing employment must not change auto_finance's config");
    assert.equal(JSON.stringify(clonedRegistry.lease), beforeLease, "removing employment must not change lease's config");

    const employmentAfterRemoval = getContractTypeLegalConfig("employment", clonedRegistry);
    assert.equal(employmentAfterRemoval.enabled, false, "a removed contract type must degrade to disabled, not throw or fall back to another type's config");
    assert.deepEqual(employmentAfterRemoval.preferredCollections, []);

    const autoFinanceAfterRemoval = getContractTypeLegalConfig("auto_finance", clonedRegistry);
    assert.equal(autoFinanceAfterRemoval.enabled, true, "other contract types must keep working after one entry is removed");
    assert.ok(autoFinanceAfterRemoval.preferredCollections.includes(LEGAL_COLLECTIONS.SAMA_CONSUMER_FINANCE));
  }
  console.log("PASS removing one contract type's registry entry does not break other contract types or the accessor");

  // --- A disabled (but present) entry also degrades safely rather than being treated as enabled ---
  {
    const registryWithDisabledLease: Record<string, ContractTypeLegalConfig> = {
      ...CONTRACT_TYPE_LEGAL_REGISTRY,
      lease: { ...CONTRACT_TYPE_LEGAL_REGISTRY.lease, enabled: false },
    };
    const config = getContractTypeLegalConfig("lease", registryWithDisabledLease);
    assert.equal(config.enabled, false);
    assert.deepEqual(config.preferredCollections, []);
  }
  console.log("PASS a disabled registry entry degrades to no collections, never silently searched");

  // --- An entirely unknown contract type string never throws ---
  {
    const config = getContractTypeLegalConfig("not_a_real_contract_type");
    assert.equal(config.enabled, false);
  }
  console.log("PASS an unrecognized contract type resolves to a safe disabled config instead of throwing");

  console.log("PASS registry.modularity.test.ts");
}

run();
