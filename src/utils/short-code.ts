import { urlAlphabet, customAlphabet } from 'nanoid';

export function generateShortCode(length = 6): string {
  const nanoid = customAlphabet(urlAlphabet, length);
  return nanoid();
}
