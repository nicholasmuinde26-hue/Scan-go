export const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'admin12345678',
  'administrator',
  'changeme1234',
  'welcome12345',
  'supersecret12',
  'letmein12345',
  'qwerty123456',
  '123456789012',
  'iloveyou1234',
  'secret123456',
  'monkey123456',
  'dragon123456',
  'master123456',
  'sunshine1234',
  'princess1234',
  'football1234',
]);

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long.' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: 'Password is too common and easily guessable.' };
  }
  return { valid: true };
}
