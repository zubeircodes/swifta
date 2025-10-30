import { parseCSV } from "./utils/csvParser.js";
import { standardizeFuelRecords, standardizeMileageRecords } from "./utils/dataStandardizer.js";
import { calculateIFTA } from "./iftaCalculator.js";

const form = document.getElementById("upload-form");
const fuelInput = document.getElementById("fuel-input");
const eldInput = document.getElementById("eld-input");
const calculateBtn = document.getElementById("calculate-btn");
const resetBtn = document.getElementById("reset-btn");
const resultsSection = document.getElementById("results");
const resultsBody = document.getElementById("results-body");
const summaryContainer = document.getElementById("summary");
const downloadBtn = document.getElementById("download-btn");
const errorPanel = document.getElementById("errors");

let lastResult = null;

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(file);
  });

const formatNumber = (value, options = {}) => {
  const hasMin = typeof options.minimumFractionDigits === "number";
  const hasMax = typeof options.maximumFractionDigits === "number";

  let minimumFractionDigits = hasMin ? options.minimumFractionDigits : 2;
  let maximumFractionDigits = hasMax ? options.maximumFractionDigits : undefined;

  if (!hasMax) {
    maximumFractionDigits = hasMin ? options.minimumFractionDigits : 2;
  }

  if (!hasMin && hasMax) {
    minimumFractionDigits = Math.min(2, options.maximumFractionDigits);
  }

  if (maximumFractionDigits < minimumFractionDigits) {
    maximumFractionDigits = minimumFractionDigits;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits
  });
  return formatter.format(value ?? 0);
};

const setLoading = (isLoading) => {
  calculateBtn.disabled = isLoading;
  calculateBtn.textContent = isLoading ? "Calculating..." : "Calculate";
};

const showError = (message) => {
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
  resultsSection.classList.add("hidden");
};

const clearError = () => {
  errorPanel.textContent = "";
  errorPanel.classList.add("hidden");
};

const renderSummary = ({ totalMiles, totalGallons, mpg, totalTaxPaid, totalTaxOwed, totalNetTax }) => {
  const netLabel = totalNetTax < 0 ? "Net Tax Refund" : "Net Tax Owed";
  const netDisplay =
    totalNetTax < 0 ? `-$${formatNumber(Math.abs(totalNetTax))}` : `$${formatNumber(totalNetTax)}`;

  summaryContainer.innerHTML = `
    <div class="summary-container">
      <div class="summary-main">
        <div class="metric-label">${netLabel}</div>
        <div class="metric-value">${netDisplay}</div>
        <div class="metric-context">Due December 31, 2025</div>
      </div>
      <div class="summary-supporting">
        <div class="supporting-metric">
          <span class="metric-name">Miles</span>
          <span class="metric-num">${formatNumber(totalMiles, { maximumFractionDigits: 0 })}</span>
        </div>
        <div class="supporting-metric">
          <span class="metric-name">Gallons</span>
          <span class="metric-num">${formatNumber(totalGallons)}</span>
        </div>
        <div class="supporting-metric">
          <span class="metric-name">MPG</span>
          <span class="metric-num">${mpg ? formatNumber(mpg) : "N/A"}</span>
        </div>
        <div class="supporting-metric">
          <span class="metric-name">Paid</span>
          <span class="metric-num">$${formatNumber(totalTaxPaid)}</span>
        </div>
        <div class="supporting-metric">
          <span class="metric-name">Owed</span>
          <span class="metric-num">$${formatNumber(totalTaxOwed)}</span>
        </div>
      </div>
    </div>
  `;
};

const renderRows = (rows) => {
  resultsBody.innerHTML = "";

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const cellConfigs = [
      { text: row.state },
      { text: formatNumber(row.miles, { maximumFractionDigits: 0 }), className: "numeric" },
      { text: formatNumber(row.gallonsUsed), className: "numeric" },
      {
        text: formatNumber(row.taxRate, { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
        className: "numeric",
        prefix: "$"
      },
      { text: formatNumber(row.taxPaid), className: "numeric", prefix: "$" },
      { text: formatNumber(row.taxOwed), className: "numeric", prefix: "$" },
      { text: formatNumber(row.netTax), className: "numeric", prefix: "$" }
    ];

    cellConfigs.forEach(({ text, className, prefix }) => {
      const td = document.createElement("td");
      if (className) {
        td.classList.add(className);
      }
      td.textContent = `${prefix ?? ""}${text}`;
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  });

  resultsBody.appendChild(fragment);
};

const downloadResults = () => {
  if (!lastResult) {
    return;
  }

  const header = [
    "state",
    "miles",
    "gallons_used",
    "tax_rate",
    "tax_paid",
    "tax_owed",
    "net_tax"
  ];

  const rows = lastResult.rows
    .map((row) =>
      [
        row.state,
        row.miles.toFixed(2),
        row.gallonsUsed.toFixed(4),
        row.taxRate.toFixed(3),
        row.taxPaid.toFixed(2),
        row.taxOwed.toFixed(2),
        row.netTax.toFixed(2)
      ].join(",")
    )
    .join("\n");

  const csv = `${header.join(",")}\n${rows}`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ifta-tax-summary.csv";
  anchor.click();
  URL.revokeObjectURL(url);
};

const resetForm = () => {
  form.reset();
  lastResult = null;
  resultsSection.classList.add("hidden");
  resultsBody.innerHTML = "";
  summaryContainer.innerHTML = "";
  clearError();
};

const handleSubmit = async (event) => {
  event.preventDefault();
  clearError();

  const fuelFile = fuelInput.files?.[0];
  const eldFile = eldInput.files?.[0];

  if (!fuelFile || !eldFile) {
    showError("Please select both the fuel and ELD CSV files.");
    return;
  }

  setLoading(true);

  try {
    const [fuelContent, eldContent] = await Promise.all([readFile(fuelFile), readFile(eldFile)]);

    const rawFuelRecords = parseCSV(fuelContent);
    const rawMileageRecords = parseCSV(eldContent);

    const fuelRecords = standardizeFuelRecords(rawFuelRecords);
    const mileageRecords = standardizeMileageRecords(rawMileageRecords);

    if (fuelRecords.length === 0) {
      throw new Error("Unable to find fuel data. Confirm the CSV contains state and gallons columns.");
    }

    if (mileageRecords.length === 0) {
      throw new Error("Unable to find mileage data. Confirm the CSV contains state and miles columns.");
    }

    const result = calculateIFTA(fuelRecords, mileageRecords);
    lastResult = result;

    renderSummary(result);
    renderRows(result.rows);

    resultsSection.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showError(error.message || "An unexpected error occurred while processing your files.");
  } finally {
    setLoading(false);
  }
};

form.addEventListener("submit", handleSubmit);
resetBtn.addEventListener("click", resetForm);
downloadBtn.addEventListener("click", downloadResults);
