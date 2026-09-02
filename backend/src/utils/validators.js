// GSTIN: 2-digit state code + 10-char PAN + 1-digit entity number + 'Z' + 1 checksum char
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidGSTIN = (value) => !value || GSTIN_PATTERN.test(String(value).trim().toUpperCase());
export const isValidEmail = (value) => !value || EMAIL_PATTERN.test(String(value).trim());
// Lenient on phone: just enough digits to be a real number once separators/country code are stripped.
export const isValidPhone = (value) => {
  if (!value) return true;
  const digits = String(value).replace(/[\s\-().]/g, '').replace(/^\+/, '');
  return /^\d{7,15}$/.test(digits);
};

// Validates whichever of gstin/email/phone are present on the payload.
// Returns an error message string, or null if everything present is valid.
export const validateContactFields = (body) => {
  if (body.gstin && !isValidGSTIN(body.gstin)) {
    return 'GSTIN format is invalid (expected format: 22AAAAA0000A1Z5)';
  }
  if (body.email && !isValidEmail(body.email)) {
    return 'Email format is invalid';
  }
  if (body.phone && !isValidPhone(body.phone)) {
    return 'Phone number format is invalid';
  }
  return null;
};
