/**
 * Kenyan phone helpers.
 *
 * Users are stored with whatever string was typed when the account was created
 * (seed: 07xxxxxxxx, invites/registration: maybe 2547xxxxxxxx or +2547xxxxxxxx).
 * Login used to do an exact string match, so 0777555666 would NOT find an account
 * saved as 254777555666. phoneVariants() returns every common spelling of the same
 * number so lookups work regardless of how the number was originally stored.
 */
export function phoneVariants(raw: string): string[] {
  const trimmed = String(raw ?? '').trim();
  const compact = trimmed.replace(/[\s\-().]/g, '');
  const variants = new Set<string>([trimmed, compact]);

  const digits = compact.replace(/^\+/, '');
  const m = digits.match(/^(?:254|0)?([17]\d{8})$/);
  if (m) {
    variants.add(`0${m[1]}`);
    variants.add(`254${m[1]}`);
    variants.add(`+254${m[1]}`);
  }
  return [...variants].filter(Boolean);
}