const stateAliases = ["state", "jurisdiction", "province", "region"];
const gallonAliases = ["gallons", "gals", "qty", "quantity", "fuel_gallons"];
const taxPaidAliases = ["tax_paid", "taxpaid", "fuel_tax_paid", "iftataxpaid", "tax"];
const milesAliases = ["miles", "distance", "trip_miles", "total_miles"];

const findColumn = (record, candidates) => {
  const keys = Object.keys(record);
  return keys.find((key) => candidates.includes(key.toLowerCase())) ?? null;
};

const toNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const standardizeFuelRecords = (records) => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((record) => {
      const stateKey = findColumn(record, stateAliases);
      const gallonsKey = findColumn(record, gallonAliases);
      const taxPaidKey = findColumn(record, taxPaidAliases);

      if (!stateKey || !gallonsKey) {
        return null;
      }

      return {
        state: (record[stateKey] ?? "").toString().trim(),
        gallons: toNumber(record[gallonsKey]),
        taxPaid: toNumber(record[taxPaidKey]),
      };
    })
    .filter((entry) => entry && entry.state !== "" && entry.gallons > 0);
};

export const standardizeMileageRecords = (records) => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((record) => {
      const stateKey = findColumn(record, stateAliases);
      const milesKey = findColumn(record, milesAliases);

      if (!stateKey || !milesKey) {
        return null;
      }

      return {
        state: (record[stateKey] ?? "").toString().trim(),
        miles: toNumber(record[milesKey]),
      };
    })
    .filter((entry) => entry && entry.state !== "" && entry.miles > 0);
};
