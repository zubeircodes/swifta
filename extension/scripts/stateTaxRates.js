export const stateTaxRates = {
  AL: 0.29,
  AK: 0.08,
  AZ: 0.26,
  AR: 0.285,
  CA: 0.47,
  CO: 0.22,
  CT: 0.417,
  DE: 0.23,
  FL: 0.345,
  GA: 0.311,
  HI: 0.16,
  ID: 0.32,
  IL: 0.392,
  IN: 0.55,
  IA: 0.325,
  KS: 0.26,
  KY: 0.287,
  LA: 0.2,
  ME: 0.311,
  MD: 0.36,
  MA: 0.24,
  MI: 0.285,
  MN: 0.285,
  MS: 0.18,
  MO: 0.245,
  MT: 0.294,
  NE: 0.299,
  NV: 0.27,
  NH: 0.238,
  NJ: 0.338,
  NM: 0.21,
  NY: 0.385,
  NC: 0.385,
  ND: 0.23,
  OH: 0.38,
  OK: 0.19,
  OR: 0,
  PA: 0.741,
  RI: 0.34,
  SC: 0.28,
  SD: 0.28,
  TN: 0.27,
  TX: 0.2,
  UT: 0.362,
  VT: 0.32,
  VA: 0.404,
  WA: 0.494,
  WV: 0.357,
  WI: 0.329,
  WY: 0.24,
  DC: 0.235
};

export const getTaxRateForState = (stateCode) => {
  if (!stateCode) {
    return 0;
  }

  const normalized = stateCode.trim().toUpperCase();
  return stateTaxRates[normalized] ?? 0;
};
