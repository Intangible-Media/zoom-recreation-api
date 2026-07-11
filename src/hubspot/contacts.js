import { hubspotClient } from './client.js';

async function findContactByEmail(email) {
  const results = await hubspotClient.crm.contacts.searchApi.doSearch({
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    limit: 1,
  });

  return results.results[0] || null;
}

/** Creates the contact if this email hasn't submitted a quote before, otherwise updates it. */
export async function upsertContact(properties) {
  const existing = await findContactByEmail(properties.email);

  if (existing) {
    const updated = await hubspotClient.crm.contacts.basicApi.update(existing.id, { properties });
    return updated.id;
  }

  const created = await hubspotClient.crm.contacts.basicApi.create({ properties });
  return created.id;
}
