import type { MailManager, ManagerConfig } from './types';
import { OutlookMailManager } from './microsoft';
import { GoogleMailManager } from './google';
import { ResendMailManager } from './resend';

const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
  resend: ResendMailManager,
};

export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error('Provider not supported');
  return new Provider(config);
};
