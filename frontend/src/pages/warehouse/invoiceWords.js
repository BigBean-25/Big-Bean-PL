// Indian-style number-to-words, shared by every Tax Invoice print view
// (Purchase Orders, GRN, ...).
export const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
export const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

export const twoDigitsWords = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));

export const threeDigitsWords = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h ? ONES[h] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigitsWords(rest) : "");
};

export const numberToWordsIndian = (n) => {
  n = Math.floor(n);
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const parts = [];
  if (crore) parts.push(threeDigitsWords(crore) + " Crore");
  if (lakh) parts.push(threeDigitsWords(lakh) + " Lakh");
  if (thousand) parts.push(threeDigitsWords(thousand) + " Thousand");
  if (n) parts.push(threeDigitsWords(n));
  return parts.join(" ");
};

export const amountInWords = (amount) => {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = "INR " + numberToWordsIndian(rupees);
  if (paise > 0) words += " and " + numberToWordsIndian(paise) + " Paise";
  return words + " Only";
};
