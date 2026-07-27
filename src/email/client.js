import { Resend } from 'resend';
import { config } from '../config.js';

export const resend = new Resend(config.resendApiKey);
