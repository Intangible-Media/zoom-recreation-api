// One-time (idempotent) setup: creates the custom HubSpot contact/deal properties
// this integration relies on. Run with `npm run hubspot:setup` after setting
// HUBSPOT_ACCESS_TOKEN in .env. Safe to re-run — existing properties are skipped.
import 'dotenv/config';
import { hubspotClient } from '../src/hubspot/client.js';
import { CUSTOM_PROPERTY_DEFINITIONS } from '../src/hubspot/properties.js';

async function ensureProperty(objectType, definition) {
  try {
    await hubspotClient.crm.properties.coreApi.getByName(objectType, definition.name);
    console.log(`[skip]    ${objectType}.${definition.name} already exists`);
  } catch (err) {
    if (err.code !== 404) throw err;
    await hubspotClient.crm.properties.coreApi.create(objectType, definition);
    console.log(`[created] ${objectType}.${definition.name}`);
  }
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
