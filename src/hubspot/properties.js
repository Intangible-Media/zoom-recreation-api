// Custom HubSpot property internal names, shared between the sync code and
// scripts/setup-hubspot-properties.js so both always agree on the schema.

export const CONTACT_PROPERTIES = {
  QUOTE_MESSAGE: 'quote_message',
  QUOTE_PAGE_URL: 'quote_page_url',
  DEVICE_INFO: 'device_info',
};

export const DEAL_PROPERTIES = {
  DEPOSIT_STATUS: 'deposit_status',
  STRIPE_SESSION_ID: 'stripe_checkout_session_id',
  QUOTE_ITEMS_JSON: 'quote_items_json',
};

export const DEPOSIT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

export const CUSTOM_PROPERTY_DEFINITIONS = {
  contacts: [
    {
      name: CONTACT_PROPERTIES.QUOTE_MESSAGE,
      label: 'Quote Message',
      type: 'string',
      fieldType: 'textarea',
      groupName: 'contactinformation',
    },
    {
      name: CONTACT_PROPERTIES.QUOTE_PAGE_URL,
      label: 'Quote Page URL',
      type: 'string',
      // textarea, not text: single-line "text" properties cap at 255 chars in HubSpot,
      // too short for real-world URLs carrying UTM/query params.
      fieldType: 'textarea',
      groupName: 'contactinformation',
    },
    {
      name: CONTACT_PROPERTIES.DEVICE_INFO,
      label: 'Device Info',
      type: 'string',
      fieldType: 'textarea',
      groupName: 'contactinformation',
    },
  ],
  deals: [
    {
      name: DEAL_PROPERTIES.DEPOSIT_STATUS,
      label: 'Deposit Status',
      type: 'enumeration',
      fieldType: 'select',
      groupName: 'dealinformation',
      options: [
        { label: 'Pending', value: DEPOSIT_STATUS.PENDING, displayOrder: 0, hidden: false },
        { label: 'Paid', value: DEPOSIT_STATUS.PAID, displayOrder: 1, hidden: false },
        { label: 'Expired', value: DEPOSIT_STATUS.EXPIRED, displayOrder: 2, hidden: false },
        { label: 'Failed', value: DEPOSIT_STATUS.FAILED, displayOrder: 3, hidden: false },
      ],
    },
    {
      name: DEAL_PROPERTIES.STRIPE_SESSION_ID,
      label: 'Stripe Checkout Session ID',
      type: 'string',
      fieldType: 'text',
      groupName: 'dealinformation',
    },
    {
      name: DEAL_PROPERTIES.QUOTE_ITEMS_JSON,
      label: 'Quote Items (JSON)',
      type: 'string',
      fieldType: 'textarea',
      groupName: 'dealinformation',
    },
  ],
};
