import { AssociationTypes } from '@hubspot/api-client';
import { hubspotClient } from './client.js';
import { DEAL_PROPERTIES, DEPOSIT_STATUS } from './properties.js';

export async function createDeal({
  dealname,
  amount,
  contactId,
  quoteItemsJson,
  depositStatus = DEPOSIT_STATUS.PENDING,
  pipelineId,
  stageId,
}) {
  const deal = await hubspotClient.crm.deals.basicApi.create({
    properties: {
      dealname,
      amount: String(amount),
      [DEAL_PROPERTIES.DEPOSIT_STATUS]: depositStatus,
      [DEAL_PROPERTIES.QUOTE_ITEMS_JSON]: quoteItemsJson,
      // HubSpot's standard deal properties for pipeline placement. Omitted (not
      // sent as empty/null) when the lookup in pipelines.js failed, so the deal
      // falls back to the account's default pipeline instead of an invalid one.
      ...(pipelineId ? { pipeline: pipelineId } : {}),
      ...(stageId ? { dealstage: stageId } : {}),
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

/**
 * Returns the deal's full original cart (including any $0 quote-only items that
 * were never sent to Stripe), or null if the deal has no cart stored or it can't
 * be parsed. Used to build the payment receipt from the *complete* quote rather
 * than just the priced items Stripe actually charged for.
 */
export async function getDealQuoteItems(dealId) {
  const deal = await hubspotClient.crm.deals.basicApi.getById(dealId, [DEAL_PROPERTIES.QUOTE_ITEMS_JSON]);
  const raw = deal.properties?.[DEAL_PROPERTIES.QUOTE_ITEMS_JSON];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // safeStringify() truncates with "...(truncated)" past MAX_QUOTE_ITEMS_JSON_LEN,
    // which breaks JSON.parse for an oversized cart — callers fall back to Stripe's
    // own line items instead of failing the receipt entirely.
    return null;
  }
}
