import { AssociationTypes } from '@hubspot/api-client';
import { hubspotClient } from './client.js';

/** Creates a HubSpot Note engagement, associated to and visible on the given deal's timeline. */
export async function createDealNote(dealId, noteBodyHtml) {
  await hubspotClient.crm.objects.notes.basicApi.create({
    properties: {
      hs_note_body: noteBodyHtml,
      // HubSpot's properties map is string-valued (see deals.js's `amount: String(amount)`
      // for the same reason) — an unstringified number here would fail validation.
      hs_timestamp: String(Date.now()),
    },
    associations: [
      {
        to: { id: dealId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: AssociationTypes.noteToDeal,
          },
        ],
      },
    ],
  });
}
