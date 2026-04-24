import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = 'en';
  const messages = (await import('./en.json')).default;
  return { locale, messages };
});
