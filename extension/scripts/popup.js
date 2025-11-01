import { parseCSV } from "./utils/csvParser.js";
import { standardizeFuelRecords, standardizeMileageRecords } from "./utils/dataStandardizer.js";
import { calculateIFTA } from "./iftaCalculator.js";

const form = document.getElementById("upload-form");
const fuelInput = document.getElementById("fuel-input");
const eldInput = document.getElementById("eld-input");
const calculateBtn = document.getElementById("calculate-btn");
const calculateLabel = calculateBtn.querySelector(".button__label");
const resetBtn = document.getElementById("reset-btn");
const resultsSection = document.getElementById("results");
const resultsBody = document.getElementById("results-body");
const summaryContainer = document.getElementById("summary");
const insightsContainer = document.getElementById("insights");
const downloadBtn = document.getElementById("download-btn");
const errorPanel = document.getElementById("errors");
const uploadStatus = document.getElementById("upload-status");
const uploadCards = {
  fuel: document.querySelector('.upload-card[data-type="fuel"]'),
  eld: document.querySelector('.upload-card[data-type="eld"]')
};

const RESULTS_HIDE_DELAY = 220;

let lastResult = null;
let hideResultsTimer = null;

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

const formatMoney = (value) => {
  const amount = Math.abs(value ?? 0);
  return `${value < 0 ? "-" : ""}$${formatNumber(amount)}`;
};

const formatMoneyAbs = (value) => `$${formatNumber(Math.abs(value ?? 0))}`;

const resolveQuarterContext = () => {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  const dueMonths = [4, 7, 10, 1];
  const dueMonth = dueMonths[quarter - 1];
  let dueYear = year;
  if (quarter === 4) {
    dueYear += 1;
  }

  const dueDay = dueMonth === 4 ? 30 : 31;
  const dueDate = new Date(dueYear, dueMonth - 1, dueDay);

  const formattedDue = dueDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  return {
    chip: `Quarter ${quarter} • ${year}`,
    context: `Due ${formattedDue}`
  };
};

const setLoading = (isLoading) => {
  calculateBtn.disabled = isLoading;
  calculateBtn.classList.toggle("is-loading", isLoading);
  calculateBtn.setAttribute("aria-busy", String(isLoading));
  if (calculateLabel) {
    calculateLabel.textContent = isLoading ? "Calculating..." : "Calculate";
  }
};

const hideResults = () => {
  resultsSection.classList.remove("is-visible");
  if (hideResultsTimer) {
    window.clearTimeout(hideResultsTimer);
  }
  hideResultsTimer = window.setTimeout(() => {
    resultsSection.classList.add("hidden");
    hideResultsTimer = null;
  }, RESULTS_HIDE_DELAY);
};

const showResults = () => {
  if (hideResultsTimer) {
    window.clearTimeout(hideResultsTimer);
    hideResultsTimer = null;
  }
  resultsSection.classList.remove("hidden");
  requestAnimationFrame(() => {
    resultsSection.classList.add("is-visible");
  });
};

const showError = (message) => {
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
  hideResults();
  downloadBtn.disabled = true;
};

const clearError = () => {
  errorPanel.textContent = "";
  errorPanel.classList.add("hidden");
};

const updateUploadStatus = () => {
  if (!uploadStatus) {
    return;
  }
  const hasFuel = Boolean(fuelInput.files && fuelInput.files.length > 0);
  const hasMileage = Boolean(eldInput.files && eldInput.files.length > 0);

  uploadStatus.classList.remove("upload__status--ready", "upload__status--pending");

  if (hasFuel && hasMileage) {
    uploadStatus.textContent = "Ready to calculate";
    uploadStatus.classList.add("upload__status--ready");
  } else if (hasFuel || hasMileage) {
    uploadStatus.textContent = hasFuel ? "Add mileage CSV" : "Add fuel CSV";
    uploadStatus.classList.add("upload__status--pending");
  } else {
    uploadStatus.textContent = "Awaiting files";
    uploadStatus.classList.add("upload__status--pending");
  }
};

const markUploadCard = (type, isComplete) => {
  const card = uploadCards[type];
  if (!card) return;
  if (isComplete) {
    card.classList.remove("is-complete");
    // Trigger reflow so the pulse animation can replay when files change.
    void card.offsetWidth;
    card.classList.add("is-complete");
  } else {
    card.classList.remove("is-complete");
  }
};

const renderSummary = (result) => {
  const { totalMiles, totalGallons, mpg, totalTaxPaid, totalTaxOwed, totalNetTax } = result;
  const netPositive = totalNetTax >= 0;
  const netLabel = netPositive ? "Net Tax Owed" : "Net Tax Refund";
  const netDisplay = formatMoney(totalNetTax);
  const { chip, context } = resolveQuarterContext();

  summaryContainer.innerHTML = `
    <div class="summary-container">
      <div class="summary-main${netPositive ? "" : " summary-main--refund"}">
        <div class="summary-main__chip">${chip}</div>
        <div class="metric-label">${netLabel}</div>
        <div class="metric-value">${netDisplay}</div>
        <div class="metric-context">${context}</div>
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
          <span class="metric-num">${formatMoneyAbs(totalTaxPaid)}</span>
        </div>
        <div class="supporting-metric">
          <span class="metric-name">Owed</span>
          <span class="metric-num">${formatMoneyAbs(totalTaxOwed)}</span>
        </div>
      </div>
    </div>
  `;
};

const renderInsights = (result) => {
  const { rows, totalGallons, totalMiles, totalTaxOwed } = result;

  insightsContainer.innerHTML = "";
  insightsContainer.classList.add("hidden");

  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const topLiability = rows.reduce(
    (acc, row) => (row.netTax > (acc?.netTax ?? -Infinity) ? row : acc),
    null
  );

  const topRefund = rows.reduce(
    (acc, row) => (row.netTax < (acc?.netTax ?? Infinity) ? row : acc),
    null
  );

  const rateHotspot = rows.reduce(
    (acc, row) => (row.taxRate > (acc?.taxRate ?? -Infinity) ? row : acc),
    null
  );

  const effectiveRate = totalGallons > 0 ? totalTaxOwed / totalGallons : 0;
  const avgMilesPerState = rows.length > 0 ? totalMiles / rows.length : 0;
  const hotspotLabel = rateHotspot
    ? `${rateHotspot.state} @ $${formatNumber(rateHotspot.taxRate, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
      })}/gal`
    : "No rate hotspots detected";
  const avgMilesLabel = `${formatNumber(avgMilesPerState, { maximumFractionDigits: 0 })} avg miles per state`;

  const insights = [
    {
      title: "Largest Liability",
      value: topLiability && topLiability.netTax > 0 
        ? `${topLiability.state} • ${formatMoney(topLiability.netTax)}`
        : "All clear",
      meta:
        topLiability && topLiability.netTax > 0
          ? "Jurisdiction owes remittance"
          : "No jurisdictions owe remittance"
    },
    {
      title: "Strongest Refund",
      value: topRefund && topRefund.netTax < 0 
        ? `${topRefund.state} • ${formatMoneyAbs(topRefund.netTax)}`
        : "Pending",
      meta:
        topRefund && topRefund.netTax < 0
          ? "Refund expected"
          : "No refunds detected this run"
    },
    {
      title: "Blended Exposure",
      value:
        effectiveRate > 0
          ? `${formatNumber(effectiveRate, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} $/gal`
          : "—",
      meta: `${hotspotLabel} • ${avgMilesLabel}`
    }
  ];

  const fragment = document.createDocumentFragment();

  insights.forEach(({ title, value, meta }) => {
    const card = document.createElement("div");
    card.className = "insight-card";

    const titleEl = document.createElement("span");
    titleEl.className = "insight-card__title";
    titleEl.textContent = title;

    const valueEl = document.createElement("span");
    valueEl.className = "insight-card__value";
    valueEl.textContent = value;

    const metaEl = document.createElement("span");
    metaEl.className = "insight-card__meta";
    metaEl.textContent = meta;

    card.append(titleEl, valueEl, metaEl);
    fragment.appendChild(card);
  });

  insightsContainer.appendChild(fragment);

  insightsContainer.classList.remove("hidden");
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
  hideResults();
  resultsBody.innerHTML = "";
  summaryContainer.innerHTML = "";
  insightsContainer.innerHTML = "";
  insightsContainer.classList.add("hidden");
  clearError();
  downloadBtn.disabled = true;
  markUploadCard("fuel", false);
  markUploadCard("eld", false);
  updateUploadStatus();
};

const handleSubmit = async (event) => {
  event.preventDefault();
  clearError();

  const fuelFiles = Array.from(fuelInput.files || []);
  const eldFiles = Array.from(eldInput.files || []);

  if (fuelFiles.length === 0 || eldFiles.length === 0) {
    showError("Please select both the fuel and ELD CSV files.");
    return;
  }

  setLoading(true);

  try {
    // Process all fuel files
    const allFuelRecords = [];
    for (const file of fuelFiles) {
      const content = await readFile(file);
      const rawRecords = parseCSV(content);
      const standardized = standardizeFuelRecords(rawRecords);
      allFuelRecords.push(...standardized);
    }

    // Process all mileage files
    const allMileageRecords = [];
    for (const file of eldFiles) {
      const content = await readFile(file);
      const rawRecords = parseCSV(content);
      const standardized = standardizeMileageRecords(rawRecords);
      allMileageRecords.push(...standardized);
    }

    if (allFuelRecords.length === 0) {
      throw new Error("Unable to find fuel data. Confirm the CSV contains state and gallons columns.");
    }

    if (allMileageRecords.length === 0) {
      throw new Error("Unable to find mileage data. Confirm the CSV contains state and miles columns.");
    }

    const result = calculateIFTA(allFuelRecords, allMileageRecords);
    lastResult = result;

    renderSummary(result);
    renderInsights(result);
    renderRows(result.rows);

    showResults();
    downloadBtn.disabled = false;
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

fuelInput.addEventListener("change", () => {
  const isComplete = Boolean(fuelInput.files && fuelInput.files.length > 0);
  markUploadCard("fuel", isComplete);
  updateUploadStatus();
});

eldInput.addEventListener("change", () => {
  const isComplete = Boolean(eldInput.files && eldInput.files.length > 0);
  markUploadCard("eld", isComplete);
  updateUploadStatus();
});

updateUploadStatus();
downloadBtn.disabled = true;