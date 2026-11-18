// The admin's dropdowns and pickers list their contents A–Z.

/**
 * Compares two names A–Z, ignoring case and accents, with numbers in numeric
 * order ("Series 2" before "Series 10").
 */
export const byName = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
}).compare
