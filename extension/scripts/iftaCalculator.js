import { getTaxRateForState } from "./stateTaxRates.js";

const stateNameToCode = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  dc: "DC"
};

const normalizeState = (stateValue) => {
  if (!stateValue) {
    return null;
  }

  const trimmed = stateValue.toString().trim();
  if (trimmed.length === 0) {
    return null;
  }

  const asUpper = trimmed.toUpperCase();
  if (asUpper.length === 2) {
    return asUpper;
  }

  const normalizedName = trimmed.toLowerCase();
  return stateNameToCode[normalizedName] ?? asUpper;
};

const aggregate = (records, key) => {
  const map = new Map();

  records.forEach((record) => {
    const stateCode = normalizeState(record.state);
    if (!stateCode) {
      return;
    }

    const current = map.get(stateCode) ?? 0;
    map.set(stateCode, current + (record[key] ?? 0));
  });

  return map;
};

export const calculateIFTA = (fuelRecords, mileageRecords) => {
  const gallonsByState = aggregate(fuelRecords, "gallons");
  const taxPaidByState = aggregate(fuelRecords, "taxPaid");
  const milesByState = aggregate(mileageRecords, "miles");

  const totalGallons = Array.from(gallonsByState.values()).reduce((sum, value) => sum + value, 0);
  const totalMiles = Array.from(milesByState.values()).reduce((sum, value) => sum + value, 0);
  const totalTaxPaid = Array.from(taxPaidByState.values()).reduce((sum, value) => sum + value, 0);

  const mpg = totalGallons > 0 ? totalMiles / totalGallons : 0;

  const states = new Set([
    ...gallonsByState.keys(),
    ...milesByState.keys(),
    ...taxPaidByState.keys()
  ]);

  const rows = Array.from(states)
    .sort()
    .map((stateCode) => {
      const miles = milesByState.get(stateCode) ?? 0;
      const gallonsUsed = mpg > 0 ? miles / mpg : 0;
      const taxRate = getTaxRateForState(stateCode);
      const taxPaid = taxPaidByState.get(stateCode) ?? 0;
      const taxOwed = gallonsUsed * taxRate;
      const netTax = taxOwed - taxPaid;

      return {
        state: stateCode,
        miles,
        gallonsUsed,
        taxRate,
        taxPaid,
        taxOwed,
        netTax
      };
    });

  const totals = rows.reduce(
    (acc, row) => {
      acc.taxOwed += row.taxOwed;
      acc.netTax += row.netTax;
      return acc;
    },
    { taxOwed: 0, netTax: 0 }
  );

  return {
    mpg,
    totalMiles,
    totalGallons,
    totalTaxPaid,
    totalTaxOwed: totals.taxOwed,
    totalNetTax: totals.netTax,
    rows
  };
};
