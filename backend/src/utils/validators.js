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

// A real database column name is always a plain identifier. Several
// controllers build dynamic INSERT/UPDATE statements by taking
// Object.keys(req.body) (or a spread of it) and interpolating those keys
// directly into the SQL column list / SET clause - the values go through
// parameterized `?` placeholders, but the KEY NAMES themselves are raw
// string concatenation with no escaping at all. A client-supplied JSON key
// containing SQL metacharacters (spaces, parens, quotes, `--`, `=`) would be
// interpolated as-is. This is the one check every one of those call sites
// must run on `fields` before building the query string, since it's the
// only thing standing between "arbitrary JSON key" and "raw SQL text".
// Throws so callers can let their existing try/catch turn it into a 400.
const SAFE_COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const assertSafeColumnNames = (fields) => {
  const bad = fields.find((f) => !SAFE_COLUMN_NAME.test(f));
  if (bad !== undefined) {
    throw new Error(`Invalid field name: ${bad}`);
  }
};
