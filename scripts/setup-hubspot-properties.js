// One-time (idempotent) setup: creates the custom HubSpot contact/deal properties
// this integration relies on. Run with `npm run hubspot:setup` after setting
// HUBSPOT_ACCESS_TOKEN in .env. Safe to re-run — existing properties are skipped.
import 'dotenv/config';
import { hubspotClient } from '../src/hubspot/client.js';
import { CUSTOM_PROPERTY_DEFINITIONS } from '../src/hubspot/properties.js';

async function ensureProperty(objectType, definition) {
  let existing;
  try {
    existing = await hubspotClient.crm.properties.coreApi.getByName(objectType, definition.name);
  } catch (err) {
    if (err.code !== 404) throw err;
  }

  if (!existing) {
    await hubspotClient.crm.properties.coreApi.create(objectType, definition);
    console.log(`[created] ${objectType}.${definition.name}`);
    return;
  }

  if (!definition.options) {
    console.log(`[skip]    ${objectType}.${definition.name} already exists`);
    return;
  }

  // Enumeration properties (e.g. deposit_status) can gain new options over time
  // (like NO_DEPOSIT below) after the property itself was already created in a
  // portal — re-running this script should add those, not just skip the property.
  const existingValues = new Set(existing.options.map((option) => option.value));
  const missingOptions = definition.options.filter((option) => !existingValues.has(option.value));

  if (missingOptions.length === 0) {
    console.log(`[skip]    ${objectType}.${definition.name} already exists (options up to date)`);
    return;
  }

  await hubspotClient.crm.properties.coreApi.update(objectType, definition.name, {
    options: [...existing.options, ...missingOptions],
  });
  console.log(
    `[updated] ${objectType}.${definition.name} added option(s): ${missingOptions.map((option) => option.value).join(', ')}`,
  );
}

async function main() {
  for (const [objectType, definitions] of Object.entries(CUSTOM_PROPERTY_DEFINITIONS)) {
    for (const definition of definitions) {
      await ensureProperty(objectType, definition);
    }
  }
}

main().catch((err) => {
  console.error('Failed to set up HubSpot properties:', err);
  process.exitCode = 1;
});
