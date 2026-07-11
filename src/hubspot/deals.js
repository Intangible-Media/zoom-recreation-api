import { AssociationTypes } from '@hubspot/api-client';
import { hubspotClient } from './client.js';
import { DEAL_PROPERTIES, DEPOSIT_STATUS } from './properties.js';

export async function createDeal({ dealname, amount, contactId, quoteItemsJson }) {
  const deal = await hubspotClient.crm.deals.basicApi.create({
    properties: {
      dealname,
      amount: String(amount),
      [DEAL_PROPERTIES.DEPOSIT_STATUS]: DEPOSIT_STATUS.PENDING,
      [DEAL_PROPERTIES.QUOTE_ITEMS_JSON]: quoteItemsJson,
    },
    associations: [
      {
        to: { id: contactId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: AssociationTypes.dealToContact,
          },
        ],
      },
    ],
  });

  return deal.id;
}

export async function setDealStripeSession(dealId, sessionId) {
  await hubspotClient.crm.deals.basicApi.update(dealId, {
    properties: { [DEAL_PROPERTIES.STRIPE_SESSION_ID]: sessionId },
  });
}

export async function updateDepositStatus(dealId, status) {
  await hubspotClient.crm.deals.basicApi.update(dealId, {
    properties: { [DEAL_PROPERTIES.DEPOSIT_STATUS]: status },
  });
}
