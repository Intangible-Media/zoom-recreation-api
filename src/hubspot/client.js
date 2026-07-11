import { Client } from '@hubspot/api-client';
import { config } from '../config.js';

export const hubspotClient = new Client({ accessToken: config.hubspotAccessToken });
