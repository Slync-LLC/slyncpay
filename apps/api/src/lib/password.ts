// Password policy: 12+ chars, must contain upper, lower, number, and symbol.
// Banned-list check guards against the most-common passwords.

const BANNED_PASSWORDS = new Set([
  "password",
  "password123",
  "password1234",
  "passwordpassword",
  "qwerty123456",
  "letmein12345",
  "welcome12345",
  "iloveyou1234",
  "1234567890ab",
  "admin1234567",
  "administrator",
  "changeme1234",
  "trustno12345",
  "passw0rd1234",
]);

export interface PasswordValidationResult {
  ok: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 12) errors.push("Must be at least 12 characters");
  if (password.length > 256) errors.push("Must be 256 characters or fewer");
  if (!/[a-z]/.test(password)) errors.push("Must contain a lowercase letter");
  if (!/[A-Z]/.test(password)) errors.push("Must contain an uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Must contain a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Must contain a symbol");
  if (BANNED_PASSWORDS.has(password.toLowerCase())) errors.push("Password is too common");

  return { ok: errors.length === 0, errors };
}
