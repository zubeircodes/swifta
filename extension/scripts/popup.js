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
const fuelFileNameEl = document.getElementById("fuel-file-name");
const fuelStatusBadge = document.getElementById("fuel-status");
const fuelFeedback = document.getElementById("fuel-feedback");
const eldFileNameEl = document.getElementById("eld-file-name");
const eldStatusBadge = document.getElementById("eld-status");
const eldFeedback = document.getElementById("eld-feedback");
const uploadOverview = document.getElementById("upload-overview");
const editInputsBtn = document.getElementById("edit-inputs-btn");
const loadingOverlay = document.getElementById("loading-overlay");

let lastResult = null;
let isProcessing = false;

const uploadState = {
  fuel: {
    file: null,
    text: null,
    ready: false,
    requiredColumns: ["state", "gallons", "tax_paid"]
  },
  eld: {
    file: null,
    text: null,
    ready: false,
    requiredColumns: ["state", "miles"]
  }
};

const statusElements = {
  fuel: {
    fileNameEl: fuelFileNameEl,
    badgeEl: fuelStatusBadge,
    feedbackEl: fuelFeedback
  },
  eld: {
    fileNameEl: eldFileNameEl,
    badgeEl: eldStatusBadge,
    feedbackEl: eldFeedback
  }
};

const badgeLabels = {
  pending: "Awaiting file",
  checking: "Checking headers…",
  success: "Ready to calculate",
  error: "Needs attention"
};

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsText(file);
  });

const extractHeaders = (text) => {
  if (!text) {
    return [];
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return [];
  }

  return firstLine
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0);
};

const updateBadge = (badgeEl, status) => {
  if (!badgeEl) {
    return;
  }

  badgeEl.classList.remove("badge--pending", "badge--success", "badge--error");
  const modifier = status === "success" ? "badge--success" : status === "error" ? "badge--error" : "badge--pending";
  badgeEl.classList.add(modifier);
  badgeEl.textContent = badgeLabels[status] ?? badgeLabels.pending;
};

const updateUploadStatus = (type, { fileName, status, message }) => {
  const elements = statusElements[type];
  if (!elements) {
    return;
  }

  const { fileNameEl, badgeEl, feedbackEl } = elements;
  const defaultLabel = fileNameEl?.dataset?.default ?? "No file selected";

  if (fileNameEl) {
    fileNameEl.textContent = fileName || defaultLabel;
    fileNameEl.title = fileName ? `${fileName}` : "";
  }

  updateBadge(badgeEl, status);

  if (feedbackEl) {
    feedbackEl.textContent = message || "";
    feedbackEl.classList.toggle("upload-feedback--error", status === "error");
  }
};

const resetUploadStatus = (type) => {
  updateUploadStatus(type, {
    fileName: "",
    status: "pending",
    message: "Choose a CSV to verify required headers."
  });
};

const updateUploadOverview = () => {
  if (!uploadOverview) {
    return;
  }

  const items = [
    { label: "Fuel CSV", value: uploadState.fuel.file?.name || "Not uploaded" },
    { label: "ELD CSV", value: uploadState.eld.file?.name || "Not uploaded" }
  ];

  uploadOverview.innerHTML = items
    .map(
      (item) => `
        <div class="upload-overview__row">
          <span class="upload-overview__label">${item.label}</span>
          <span>${item.value}</span>
        </div>
      `
    )
    .join("");
};

const formatNumber = (value, options = {}) => {
  let { minimumFractionDigits, maximumFractionDigits, ...rest } = options;

  if (minimumFractionDigits == null && maximumFractionDigits == null) {
    minimumFractionDigits = 2;
    maximumFractionDigits = 2;
  } else {
    if (minimumFractionDigits == null) {
      minimumFractionDigits = Math.min(maximumFractionDigits ?? 2, 2);
    }

    if (maximumFractionDigits == null) {
      maximumFractionDigits = Math.max(minimumFractionDigits, 2);
    }
  }

  if (maximumFractionDigits < minimumFractionDigits) {
    maximumFractionDigits = minimumFractionDigits;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
    ...rest
  });
  return formatter.format(value ?? 0);
};

const updateCalculateState = () => {
  const ready = uploadState.fuel.ready && uploadState.eld.ready;
  calculateBtn.disabled = isProcessing || !ready;
};

const refreshInputInteractivity = () => {
  const collapsed = form.classList.contains("card--collapsed");
  const shouldDisable = isProcessing || collapsed;
  [fuelInput, eldInput].forEach((input) => {
    input.disabled = shouldDisable;
  });
};

const setFormCollapsed = (collapsed) => {
  form.classList.toggle("card--collapsed", collapsed);
  if (collapsed) {
    updateUploadOverview();
  }
  refreshInputInteractivity();
  if (!collapsed && !isProcessing) {
    fuelInput.focus({ preventScroll: true });
  }
  updateCalculateState();
};

const setLoading = (loading) => {
  isProcessing = loading;
  calculateBtn.textContent = loading ? "Calculating…" : "Calculate";
  form.classList.toggle("is-loading", loading);
  loadingOverlay?.classList.toggle("hidden", !loading);
  resetBtn.disabled = loading;
  refreshInputInteractivity();
  updateCalculateState();
};

const validateHeaders = (type, headers) => {
  const required = uploadState[type].requiredColumns;
  const missing = required.filter((column) => !headers.includes(column));
  return {
    isValid: missing.length === 0,
    missing
  };
};

const handleFileSelection = async (input, type) => {
  const file = input.files?.[0] ?? null;
  uploadState[type].file = file;
  uploadState[type].text = null;
  uploadState[type].ready = false;

  if (!file) {
    resetUploadStatus(type);
    updateUploadOverview();
    updateCalculateState();
    return;
  }

  updateUploadStatus(type, {
    fileName: file.name,
    status: "checking",
    message: "Verifying required headers…"
  });

  try {
    const text = await readFile(file);
    uploadState[type].text = text;
    const headers = extractHeaders(text);
    const { isValid, missing } = validateHeaders(type, headers);

    if (!isValid) {
      const missingList = missing.map((header) => `\`${header}\``).join(", ");
      updateUploadStatus(type, {
        fileName: file.name,
        status: "error",
        message: `Missing required header${missing.length > 1 ? "s" : ""}: ${missingList}`
      });
      uploadState[type].ready = false;
    } else {
      updateUploadStatus(type, {
        fileName: file.name,
        status: "success",
        message: "All required headers detected."
      });
      uploadState[type].ready = true;
    }
  } catch (error) {
    console.error(error);
    updateUploadStatus(type, {
      fileName: file.name,
      status: "error",
      message: "Could not read the file. Please try another CSV."
    });
    uploadState[type].ready = false;
  }

  updateUploadOverview();
  updateCalculateState();
};

const showError = (message) => {
  errorPanel.textContent = message;
  errorPanel.classList.remove("hidden");
  resultsSection.classList.add("hidden");
  setFormCollapsed(false);
};

const clearError = () => {
  errorPanel.textContent = "";
  errorPanel.classList.add("hidden");
};

const renderSummary = ({ totalMiles, totalGallons, mpg, totalTaxPaid, totalTaxOwed, totalNetTax }) => {
  const netClass =
    totalNetTax > 0 ? "kpi-card--positive" : totalNetTax < 0 ? "kpi-card--negative" : "";
  const netHint =
    totalNetTax > 0 ? "Amount owed" : totalNetTax < 0 ? "Refund due" : "Balanced";

  summaryContainer.innerHTML = `
    <article class="kpi-card">
      <h3 class="kpi-card__label">Total Miles</h3>
      <p class="kpi-card__value">${formatNumber(totalMiles, { maximumFractionDigits: 0 })}</p>
      <p class="kpi-card__hint">Across all jurisdictions</p>
    </article>
    <article class="kpi-card">
      <h3 class="kpi-card__label">Total Gallons</h3>
      <p class="kpi-card__value">${formatNumber(totalGallons)}</p>
      <p class="kpi-card__hint">Combined fuel purchases</p>
    </article>
    <article class="kpi-card">
      <h3 class="kpi-card__label">Fleet MPG</h3>
      <p class="kpi-card__value">${mpg ? formatNumber(mpg) : "N/A"}</p>
      <p class="kpi-card__hint">Based on miles ÷ gallons used</p>
    </article>
    <article class="kpi-card">
      <h3 class="kpi-card__label">Tax Paid</h3>
      <p class="kpi-card__value">$${formatNumber(totalTaxPaid)}</p>
      <p class="kpi-card__hint">At the pump</p>
    </article>
    <article class="kpi-card">
      <h3 class="kpi-card__label">Tax Owed</h3>
      <p class="kpi-card__value">$${formatNumber(totalTaxOwed)}</p>
      <p class="kpi-card__hint">Jurisdiction assessment</p>
    </article>
    <article class="kpi-card ${netClass}">
      <h3 class="kpi-card__label">Net Tax</h3>
      <p class="kpi-card__value">$${formatNumber(totalNetTax)}</p>
      <p class="kpi-card__hint">${netHint}</p>
    </article>
  `;
};

const renderRows = (rows) => {
  resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.state}</td>
          <td class="numeric">${formatNumber(row.miles, { maximumFractionDigits: 0 })}</td>
          <td class="numeric">${formatNumber(row.gallonsUsed)}</td>
          <td class="numeric">$${formatNumber(row.taxRate, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
          <td class="numeric">$${formatNumber(row.taxPaid)}</td>
          <td class="numeric">$${formatNumber(row.taxOwed)}</td>
          <td class="numeric net-cell ${
            row.netTax > 0 ? "net-cell--positive" : row.netTax < 0 ? "net-cell--negative" : ""
          }">$${formatNumber(row.netTax)}</td>
        </tr>
      `
    )
    .join("");
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
  downloadBtn.disabled = true;

  Object.keys(uploadState).forEach((type) => {
    uploadState[type].file = null;
    uploadState[type].text = null;
    uploadState[type].ready = false;
    resetUploadStatus(type);
  });

  updateUploadOverview();
  setFormCollapsed(false);
  clearError();
};

const handleSubmit = async (event) => {
  event.preventDefault();
  clearError();

  const fuelUpload = uploadState.fuel;
  const eldUpload = uploadState.eld;

  if (!fuelUpload.file || !eldUpload.file) {
    showError("Please select both the fuel and ELD CSV files.");
    return;
  }

  if (!fuelUpload.ready || !eldUpload.ready) {
    showError("Please resolve the header requirements for each CSV before calculating.");
    return;
  }

  setLoading(true);

  try {
    const [fuelContent, eldContent] = await Promise.all([
      fuelUpload.text ?? readFile(fuelUpload.file),
      eldUpload.text ?? readFile(eldUpload.file)
    ]);

    fuelUpload.text = fuelContent;
    eldUpload.text = eldContent;

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

    downloadBtn.disabled = false;
    resultsSection.classList.remove("hidden");
    setFormCollapsed(true);
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
fuelInput.addEventListener("change", () => handleFileSelection(fuelInput, "fuel"));
eldInput.addEventListener("change", () => handleFileSelection(eldInput, "eld"));
editInputsBtn?.addEventListener("click", () => {
  setFormCollapsed(false);
  clearError();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

resetUploadStatus("fuel");
resetUploadStatus("eld");
updateUploadOverview();
downloadBtn.disabled = true;
updateCalculateState();
refreshInputInteractivity();
