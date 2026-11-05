import "./style.css";

interface DashboardSummary {
  project_id: number;
  project_name: string;
  contract_value: string;
  status: string;
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_contract_value: string;
  total_invoiced: string;
  total_paid: string;
  outstanding_balance: string;
  unpaid_invoice_count: number;
  overdue_invoice_count: number;
  overdue_balance: string;
}

interface Project {
  project_id: number;
  project_name: string;
  contract_value: string;
  status: "active" | "completed";
}

interface ProjectReport {
  project_id: number;
  project_name: string;
  status: string;
  contract_value: string;
  invoice_count: number;
  total_invoiced: string;
  total_paid: string;
  outstanding_balance: string;
}

interface Payment {
  payment_id: number;
  invoice_id: number;
  amount: string;
  payment_date: string;
}

interface Invoice {
  invoice_id: number;
  project_id: number;
  project_name: string;
  amount: string;
  due_date: string;
  amount_paid: string;
  outstanding_balance: string;
}

interface WebhookStats {
  total_events: number;
  pending_events: number;
  sent_events: number;
  failed_events: number;
  total_attempts: number;
}

interface WebhookAlert {
  alert_id: number;
  event_id: number;
  alert_type: string;
  message: string;
  created_at: string;
  acknowledged_at: string | null;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const API_URL = `${API_BASE_URL}/dashboard/summary`;

let editingProjectId: number | null = null;

const cancelEditButton =
  document.querySelector<HTMLButtonElement>("#cancel-edit");

const projectFormHeading =
  document.querySelector<HTMLHeadingElement>("#project-form-heading");

const projectSubmitButton =
  document.querySelector<HTMLButtonElement>("#project-submit");

const statusMessage = document.querySelector<HTMLParagraphElement>("#dashboard-status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");
const refreshIcon = document.querySelector<SVGElement>("#refresh-icon");
const kpiGrid = document.querySelector<HTMLElement>("#kpi-grid");

const projectsTableBody =
  document.querySelector<HTMLTableSectionElement>("#projects-table-body");

const projectsStatus =
  document.querySelector<HTMLParagraphElement>("#projects-status");

const projectForm =
  document.querySelector<HTMLFormElement>("#project-form");

const projectNameInput =
  document.querySelector<HTMLInputElement>("#project-name");

const contractValueInput =
  document.querySelector<HTMLInputElement>("#contract-value-input");

const projectStatusInput =
  document.querySelector<HTMLSelectElement>("#project-status");

const projectFormStatus =
  document.querySelector<HTMLParagraphElement>("#project-form-status");

const invoicesTableBody =
  document.querySelector<HTMLTableSectionElement>("#invoices-table-body");

const webhookTotal = document.getElementById("webhook-total");

const webhookPending = document.getElementById("webhook-pending");

const webhookSent = document.getElementById("webhook-sent");

const webhookFailed = document.getElementById("webhook-failed");

const webhookAttempts = document.getElementById("webhook-attempts");

const invoicesStatus =
  document.querySelector<HTMLParagraphElement>("#invoices-status");

const invoiceForm =
  document.querySelector<HTMLFormElement>("#invoice-form");

const invoiceProjectInput =
  document.querySelector<HTMLSelectElement>("#invoice-project");

const invoiceAmountInput =
  document.querySelector<HTMLInputElement>("#invoice-amount");

const invoiceDueDateInput =
  document.querySelector<HTMLInputElement>("#invoice-due-date");

const invoiceFormStatus =
  document.querySelector<HTMLParagraphElement>("#invoice-form-status");

const invoiceSubmitButton =
  document.querySelector<HTMLButtonElement>("#invoice-submit");

const valueElements: Partial<Record<keyof DashboardSummary, HTMLElement | null>> = {
  total_projects: document.querySelector<HTMLElement>("#total-projects"),
  active_projects: document.querySelector<HTMLElement>("#active-projects"),
  completed_projects: document.querySelector<HTMLElement>("#completed-projects"),
  total_contract_value: document.querySelector<HTMLElement>("#contract-value"),
  total_invoiced: document.querySelector<HTMLElement>("#total-invoiced"),
  total_paid: document.querySelector<HTMLElement>("#total-paid"),
  outstanding_balance: document.querySelector<HTMLElement>("#outstanding-balance"),
  unpaid_invoice_count: document.querySelector<HTMLElement>("#unpaid-invoices"),
  overdue_invoice_count: document.querySelector<HTMLElement>("#overdue-invoices"),
  overdue_balance: document.querySelector<HTMLElement>("#overdue-balance"),
};

const countFields = [
  "total_projects",
  "active_projects",
  "completed_projects",
  "unpaid_invoice_count",
  "overdue_invoice_count",
] as const;
const moneyFields = [
  "total_contract_value",
  "total_invoiced",
  "total_paid",
  "outstanding_balance",
  "overdue_balance",
] as const;
const decimalPattern = /^-?\d+(?:\.\d+)?$/;

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;

  return (
    countFields.every((field) => Number.isSafeInteger(data[field]) && Number(data[field]) >= 0) &&
    moneyFields.every((field) => {
      const amount = data[field];
      return typeof amount === "string" && decimalPattern.test(amount) && Number.isFinite(Number(amount));
    })
  );
}

function formatCount(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return "—";
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: string): string {
  const amount = value.trim();
  if (!decimalPattern.test(amount) || !Number.isFinite(Number(amount))) return "—";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function renderDashboard(data: DashboardSummary): void {
  for (const field of countFields) {
    const element = valueElements[field];
    if (element) element.textContent = formatCount(data[field]);
  }
  for (const field of moneyFields) {
    const element = valueElements[field];
    if (element) element.textContent = formatMoney(data[field]);
  }
}

async function getProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const projects: Project[] = await response.json();

  return projects;
}

async function getProjectReports(): Promise<ProjectReport[]> {
  const response = await fetch(`${API_BASE_URL}/reports/projects`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const reports: ProjectReport[] = await response.json();
  return reports;
}

async function loadWebhookStats(): Promise<void> {
  const section = document.querySelector<HTMLElement>("#webhook-monitoring");
  if (!section) return;

  section.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(`${API_BASE_URL}/webhook-stats`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Webhook stats API returned ${response.status}`);
    }

    const stats: unknown = await response.json();
    if (!isWebhookStats(stats)) {
      throw new Error("Webhook stats API returned invalid data.");
    }

    renderWebhookStats(stats);
    console.info("Webhook stats loaded successfully.");
  } catch (error) {
    console.error("Could not load webhook stats:", error);
  } finally {
    section.setAttribute("aria-busy", "false");
  }
}

async function loadWebhookAlerts(): Promise<void> {
  const section = document.querySelector<HTMLElement>("#webhook-alerts");
  const tableBody = document.querySelector<HTMLTableSectionElement>("#webhook-alerts-body");
  if (!section || !tableBody) return;

  section.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(`${API_BASE_URL}/webhook-alerts`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Webhook alerts API returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !payload.every(isWebhookAlert)) {
      throw new Error("Webhook alerts API returned invalid data.");
    }

    renderWebhookAlerts(payload);
  } catch (error) {
    console.error("Could not load webhook alerts:", error);
    renderWebhookAlertMessage("Could not load webhook alerts. Check the API, then refresh.");
  } finally {
    section.setAttribute("aria-busy", "false");
  }
}

function isWebhookAlert(value: unknown): value is WebhookAlert {
  if (typeof value !== "object" || value === null) return false;
  const alert = value as Record<string, unknown>;

  return (
    Number.isSafeInteger(alert.alert_id) &&
    Number.isSafeInteger(alert.event_id) &&
    typeof alert.alert_type === "string" &&
    typeof alert.message === "string" &&
    typeof alert.created_at === "string" &&
    (typeof alert.acknowledged_at === "string" || alert.acknowledged_at === null)
  );
}

function renderWebhookAlertMessage(message: string): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>("#webhook-alerts-body");
  if (!tableBody) return;

  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.className = "p-3 text-slate-500";
  cell.textContent = message;
  row.appendChild(cell);
  tableBody.replaceChildren(row);
}

function renderWebhookAlerts(alerts: WebhookAlert[]): void {
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    "#webhook-alerts-body"
  );

  if (!tableBody) return;

  if (alerts.length === 0) {
    renderWebhookAlertMessage("No webhook alerts.");
    return;
  }

  const rows = alerts.map((alert) => {
    const row = document.createElement("tr");
    row.className = "border-t border-stone-100";

    const values = [
      String(alert.event_id),
      alert.alert_type,
      alert.message,
      new Date(alert.created_at).toLocaleString("en-PH"),
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.className = "p-3 align-top text-slate-700";
      cell.textContent = value;
      row.appendChild(cell);
    }

    const statusCell = document.createElement("td");
    statusCell.className = "p-3 align-top";

    const isAcknowledged = alert.acknowledged_at !== null;

    statusCell.textContent = isAcknowledged
      ? "Acknowledged"
      : "Unacknowledged";

    row.appendChild(statusCell);

    const actionCell = document.createElement("td");
    actionCell.className = "p-3 align-top";

    if (!isAcknowledged) {
      const button = document.createElement("button");

      button.textContent = "Acknowledge";
      button.className =
        "rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700";

      button.addEventListener("click", () => {
        acknowledgeWebhookAlert(alert.alert_id);
      });

      actionCell.appendChild(button);
    } else {
      actionCell.textContent = "Completed";
    }

    row.appendChild(actionCell);

    return row;
  });

  tableBody.replaceChildren(...rows);
}

async function acknowledgeWebhookAlert(alertId: number): Promise<void> {
  if (!Number.isSafeInteger(alertId) || alertId <= 0) {
    console.error("Invalid webhook alert ID:", alertId);
    return;
  }

  const section = document.querySelector<HTMLElement>("#webhook-alerts");
  section?.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(
      `${API_BASE_URL}/webhook-alerts/${alertId}/acknowledge`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Could not acknowledge webhook alert: ${await response.text()}`);
    }

    await loadWebhookAlerts();
  } catch (error) {
    console.error("Could not acknowledge webhook alert:", error);
    renderWebhookAlertMessage("Could not acknowledge this alert. Please try again.");
  } finally {
    section?.setAttribute("aria-busy", "false");
  }
}

function renderWebhookStats(stats: WebhookStats): void {
  if (
    !webhookTotal ||
    !webhookPending ||
    !webhookSent ||
    !webhookFailed ||
    !webhookAttempts
  ) {
    console.error("Webhook monitoring elements not found.");
    return;
  }

  webhookTotal.textContent = String(stats.total_events);
  webhookPending.textContent = String(stats.pending_events);
  webhookSent.textContent = String(stats.sent_events);
  webhookFailed.textContent = String(stats.failed_events);
  webhookAttempts.textContent = String(stats.total_attempts);
}

function isWebhookStats(value: unknown): value is WebhookStats {
  if (typeof value !== "object" || value === null) return false;
  const stats = value as Record<string, unknown>;

  return [
    "total_events",
    "pending_events",
    "sent_events",
    "failed_events",
    "total_attempts",
  ].every(
    (field) =>
      Number.isSafeInteger(stats[field]) && Number(stats[field]) >= 0
  );
}

async function loadProjectOptions(): Promise<void> {
  if (!invoiceProjectInput) return;

  try {
    const projects = await getProjects();

    console.log("Projects loaded for dropdown:", projects);

    invoiceProjectInput.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a project";

    invoiceProjectInput.appendChild(placeholder);

    for (const project of projects) {
      const option = document.createElement("option");

      option.value = String(project.project_id);
      option.textContent = project.project_name;

      invoiceProjectInput.appendChild(option);
    }
  } catch (error) {
    console.error("Could not load project options:", error);

    if (invoiceFormStatus) {
      invoiceFormStatus.textContent =
        "Could not load projects. Check the API.";
    }
  }
}

async function getInvoices(): Promise<Invoice[]> {
  const response = await fetch(`${API_BASE_URL}/invoices`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  const invoices: Invoice[] = await response.json();

  return invoices;
}

function renderProjectReports(reports: ProjectReport[]): void {
  const tableBody = document.getElementById(
    "projectReportsTableBody"
  ) as HTMLTableSectionElement | null;

  if (!tableBody) {
    console.error("Project reports table body not found.");
    return;
  }

  const escapeHTML = (value: string): string => {
    return value.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[char];
    });
  };

  if (reports.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No project reports found.</td></tr>';
    return;
  }

  tableBody.innerHTML = reports.map((report) => `
    <tr class="border-t border-stone-100 hover:bg-stone-50/70">
      <td class="px-4 py-3 font-medium text-slate-800">${escapeHTML(report.project_name)}</td>
      <td class="px-4 py-3 capitalize text-slate-600">${escapeHTML(report.status)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">${formatMoney(report.contract_value)}</td>
      <td class="px-4 py-3 text-right tabular-nums">${formatCount(report.invoice_count)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">${formatMoney(report.total_invoiced)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right tabular-nums">${formatMoney(report.total_paid)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">${formatMoney(report.outstanding_balance)}</td>
    </tr>
  `).join("");
}

function renderInvoices(invoices: Invoice[]): void {
  if (!invoicesTableBody) return;

  invoicesTableBody.replaceChildren();

  if (invoices.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.className = "px-4 py-6 text-center text-slate-500";
    cell.textContent = "No invoices found.";

    row.appendChild(cell);
    invoicesTableBody.appendChild(row);
    return;
  }

  for (const invoice of invoices) {
    const row = document.createElement("tr");
    row.className = "border-t border-stone-100 hover:bg-stone-50/70";

    const invoiceIdCell = document.createElement("td");
    invoiceIdCell.className = "whitespace-nowrap px-4 py-3 tabular-nums text-slate-500";
    invoiceIdCell.textContent = String(invoice.invoice_id);

    const projectCell = document.createElement("td");
    projectCell.className = "px-4 py-3 font-medium";
    projectCell.textContent = invoice.project_name;

    const amountCell = document.createElement("td");
    amountCell.className = "whitespace-nowrap px-4 py-3 text-right tabular-nums";
    amountCell.textContent = formatMoney(invoice.amount);

    const dueDateCell = document.createElement("td");
    dueDateCell.className = "whitespace-nowrap px-4 py-3";

    const dueDate = new Date(`${invoice.due_date}T00:00:00`);

    dueDateCell.textContent = Number.isNaN(dueDate.getTime())
      ? invoice.due_date
      : dueDate.toLocaleDateString("en-PH");

    const paidCell = document.createElement("td");
    paidCell.className = "whitespace-nowrap px-4 py-3 text-right tabular-nums";
    paidCell.textContent = formatMoney(invoice.amount_paid);

    const outstandingCell = document.createElement("td");
    outstandingCell.className = "whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums";
    outstandingCell.textContent = formatMoney(invoice.outstanding_balance);

    const actionCell = document.createElement("td");
    actionCell.className = "whitespace-nowrap px-4 py-3";

    const paymentButton = document.createElement("button");
    paymentButton.type = "button";
    paymentButton.textContent = "Record Payment";
    paymentButton.dataset.invoiceId = String(invoice.invoice_id);
    paymentButton.className =
      "font-semibold text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40";

    const historyButton = document.createElement("button");

    historyButton.type = "button";
    historyButton.textContent = "View History";
    historyButton.dataset.action = "view-payments";
    historyButton.dataset.invoiceId = String(invoice.invoice_id);

    historyButton.className =
      "mr-3 font-semibold text-blue-700 hover:underline";

    actionCell.appendChild(historyButton);

    paymentButton.disabled = Number(invoice.outstanding_balance) <= 0;

    actionCell.appendChild(paymentButton);

    row.append(
      invoiceIdCell,
      projectCell,
      amountCell,
      dueDateCell,
      paidCell,
      outstandingCell,
      actionCell
    );

    invoicesTableBody.appendChild(row);
  }
}

async function loadProjectReports(): Promise<void> {
  const tableBody = document.getElementById(
    "projectReportsTableBody"
  ) as HTMLTableSectionElement | null;

  try {
    const reports = await getProjectReports();
    renderProjectReports(reports);
  } catch (error) {
    console.error("Failed to load project reports:", error);

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">Failed to load project reports.</td>
        </tr>
      `;
    }
  }
}

async function loadInvoices(): Promise<void> {
  if (!invoicesStatus) return;

  invoicesStatus.textContent = "Loading invoices...";

  try {
    const invoices = await getInvoices();

    renderInvoices(invoices);

    invoicesStatus.textContent =
      `${invoices.length} invoice(s) loaded successfully.`;
  } catch (error) {
    invoicesStatus.textContent =
      "Could not load invoices. Check that FastAPI is running.";

    console.error("Could not load invoices:", error);
  }
}

function startEditingProject(project: Project): void {
  if (
    !projectNameInput ||
    !contractValueInput ||
    !projectStatusInput ||
    !projectFormHeading ||
    !projectSubmitButton ||
    !cancelEditButton
  ) return;

  editingProjectId = project.project_id;

  projectNameInput.value = project.project_name;
  contractValueInput.value = project.contract_value;
  projectStatusInput.value = project.status;

  projectFormHeading.textContent = "Edit project";
  projectSubmitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;

  projectForm?.scrollIntoView({ behavior: "smooth" });
}

function resetProjectForm(): void {
  projectForm?.reset();
  editingProjectId = null;

  if (projectFormHeading) projectFormHeading.textContent = "Add project";
  if (projectSubmitButton) {
    projectSubmitButton.textContent = "Create project";
    projectSubmitButton.disabled = false;
  }
  if (cancelEditButton) cancelEditButton.hidden = true;
}

function renderProjects(projects: Project[]): void {
  if (!projectsTableBody) return;

  projectsTableBody.replaceChildren();

  if (projects.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.className = "px-4 py-6 text-center text-slate-500";
    cell.textContent = "No projects found.";

    row.appendChild(cell);
    projectsTableBody.appendChild(row);
    return;
  }

  for (const project of projects) {
    const row = document.createElement("tr");
    row.className = "border-t border-stone-100";

    const nameCell = document.createElement("td");
    nameCell.className = "px-4 py-3 font-medium";
    nameCell.textContent = project.project_name;

    const valueCell = document.createElement("td");
    valueCell.className = "px-4 py-3";

    const amount = Number(project.contract_value);

    valueCell.textContent = Number.isFinite(amount)
      ? new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(amount)
      : "—";

    const statusCell = document.createElement("td");
    statusCell.className = "px-4 py-3";

    statusCell.textContent = project.status;

    const actionCell = document.createElement("td");
    actionCell.className = "px-4 py-3";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.dataset.action = "edit";
    editButton.dataset.id = String(project.project_id);
    editButton.className = "font-semibold text-emerald-700 hover:underline";

const deleteButton = document.createElement("button");
deleteButton.type = "button";
deleteButton.textContent = "Delete";
deleteButton.dataset.action = "delete";
deleteButton.dataset.id = String(project.project_id);
deleteButton.className =
  "ml-3 font-semibold text-rose-700 hover:underline";

actionCell.append(editButton, deleteButton);

    row.append(nameCell, valueCell, statusCell, actionCell);
    projectsTableBody.appendChild(row);
  }
}

invoicesTableBody?.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) return;

  if (target.dataset.action === "view-payments") {
  const invoiceId = Number(target.dataset.invoiceId);

  if (Number.isSafeInteger(invoiceId) && invoiceId > 0) {
    await showPaymentHistory(invoiceId);
  }

  return;
}

  const invoiceId = Number(target.dataset.invoiceId);

  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return;

  const amount = window.prompt("Enter the payment amount (PHP):");

  if (amount === null) return;

  const paymentAmount = Number(amount);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    alert("Please enter a valid payment amount.");
    return;
  }

  target.disabled = true;

  try {
    await recordPayment(invoiceId, amount);

    alert("Payment recorded successfully!");

    await Promise.all([
      loadInvoices(),
      loadDashboard(),
      loadProjectReports(),
    ]);
  } catch (error) {
    console.error("Payment failed:", error);
    alert("Payment failed. Check the outstanding balance and API response.");
  } finally {
    target.disabled = false;
  }
});

projectsTableBody?.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) return;

  const projectId = Number(target.dataset.id);
  const action = target.dataset.action;

  if (!Number.isSafeInteger(projectId)) return;

  try {
    const projects = await getProjects();

    const project = projects.find(
      (item) => item.project_id === projectId
    );

    if (!project) {
      throw new Error("Project not found.");
    }

    if (action === "edit") {
      startEditingProject(project);
      return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${project.project_name}"?`
      );

      if (!confirmed) return;

      await deleteProject(projectId);

      if (editingProjectId === projectId) {
        resetProjectForm();
      }

      if (projectsStatus) {
        projectsStatus.textContent = "Project deleted successfully.";
      }

      await Promise.all([
        loadProjects(),
        loadDashboard(),
        loadProjectReports(),
      ]);
    }
  } catch (error) {
    if (projectsStatus) {
      projectsStatus.textContent =
        "The operation failed. Check the API response.";
    }

    console.error("Project action failed:", error);
  }
});

async function loadProjects(): Promise<void> {
  if (!projectsStatus) return;

  projectsStatus.textContent = "Loading projects...";

  try {
    const projects = await getProjects();

    renderProjects(projects);

    projectsStatus.textContent =
      `${projects.length} project(s) loaded successfully.`;
  } catch (error) {
    projectsStatus.textContent =
      "Could not load projects. Check that FastAPI is running.";

    console.error("Could not load projects:", error);
  }
}

async function createProject(
  projectName: string,
  contractValue: string,
  status: "active" | "completed"
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      project_name: projectName,
      contract_value: contractValue,
      status: status,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Could not create project: ${error}`);
  }
}

async function createInvoice(
  projectId: number,
  amount: string,
  dueDate: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      project_id: projectId,
      amount: amount,
      due_date: dueDate,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Could not create invoice: ${await response.text()}`
    );
  }
}

async function getInvoicePayments(
  invoiceId: number
): Promise<Payment[]> {
  const response = await fetch(
    `${API_BASE_URL}/invoices/${invoiceId}/payments`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return await response.json();
}

invoiceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (
    !invoiceProjectInput ||
    !invoiceAmountInput ||
    !invoiceDueDateInput ||
    !invoiceFormStatus
  ) {
    return;
  }

  const projectId = Number(invoiceProjectInput.value);
  const amount = invoiceAmountInput.value;
  const dueDate = invoiceDueDateInput.value;

  if (
    !Number.isSafeInteger(projectId) ||
    projectId <= 0 ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0 ||
    !dueDate
  ) {
    invoiceFormStatus.textContent =
      "Please enter valid invoice details.";
    return;
  }

  if (invoiceSubmitButton) {
    invoiceSubmitButton.disabled = true;
  }

  invoiceFormStatus.textContent = "Creating invoice...";

  try {
    await createInvoice(projectId, amount, dueDate);
    await loadProjectOptions();
    await loadProjectReports();

    invoiceForm.reset();

    invoiceFormStatus.textContent =
      "Invoice created successfully!";

    await Promise.all([
      loadInvoices(),
      loadDashboard(),
      loadProjectReports(),
    ]);
  } catch (error) {
    invoiceFormStatus.textContent =
      "Could not create invoice. Check the API.";

    console.error("Invoice creation failed:", error);
  } finally {
    if (invoiceSubmitButton) {
      invoiceSubmitButton.disabled = false;
    }
  }
});

async function updateProject(
  projectId: number,
  projectName: string,
  contractValue: string,
  status: "active" | "completed"
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      project_name: projectName,
      contract_value: contractValue,
      status: status,
    }),
  });

  if (!response.ok) {
    throw new Error(`Could not update project: ${await response.text()}`);
  }
}

async function deleteProject(projectId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not delete project: ${await response.text()}`
    );
  }
}

projectForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (
    !projectNameInput ||
    !contractValueInput ||
    !projectStatusInput ||
    !projectFormStatus
  ) {
    return;
  }

  const projectName = projectNameInput.value.trim();
  const contractValue = contractValueInput.value;
  const status = projectStatusInput.value;

  if (!projectName || !contractValue || !["active", "completed"].includes(status)) {
    projectFormStatus.textContent = "Please enter valid project details.";
    return;
  }

  const submitButton = document.querySelector<HTMLButtonElement>("#project-submit");

  if (submitButton) submitButton.disabled = true;

  projectFormStatus.textContent = "Creating project...";

  if (editingProjectId !== null) {
  await updateProject(
    editingProjectId,
    projectName,
    contractValue,
    status as "active" | "completed"
  );

  projectFormStatus.textContent = "Project updated successfully!";
} else {
  await createProject(
    projectName,
    contractValue,
    status as "active" | "completed"
  );

  projectFormStatus.textContent = "Project created successfully!";
}

resetProjectForm();

await Promise.all([
  loadProjects(),
  loadDashboard(),
  loadProjectReports(),
]);
});

async function loadDashboard(): Promise<void> {
  if (!statusMessage || !refreshButton || !refreshIcon || !kpiGrid) return;

  refreshButton.disabled = true;
  refreshIcon.classList.add("animate-spin");
  statusMessage.classList.remove("text-rose-700");
  statusMessage.textContent = "Loading dashboard data…";
  kpiGrid.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`The API returned ${response.status}.`);

    const payload: unknown = await response.json();
    if (!isDashboardSummary(payload)) throw new Error("The API returned invalid dashboard data.");

    renderDashboard(payload);
    statusMessage.textContent = `Updated just now · ${new Date().toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch (error) {
    statusMessage.classList.add("text-rose-700");
    statusMessage.textContent =
      error instanceof Error && error.message === "The API returned invalid dashboard data."
        ? "The server returned dashboard data in an unexpected format. Check the API response, then refresh."
        : "Could not load dashboard data. Make sure the FastAPI server is running, then refresh.";
    console.error("Dashboard request failed:", error);
  } finally {
    refreshButton.disabled = false;
    refreshIcon.classList.remove("animate-spin");
    kpiGrid.setAttribute("aria-busy", "false");
  }
}

async function showPaymentHistory(invoiceId: number): Promise<void> {
  const section = document.querySelector<HTMLElement>("#payment-history");
  const status = document.querySelector<HTMLElement>("#payment-history-status");
  const list = document.querySelector<HTMLElement>("#payment-history-list");

  if (!section || !status || !list) return;

  section.hidden = false;
  status.textContent = "Loading payment history...";
  list.replaceChildren();

  try {
    const payments = await getInvoicePayments(invoiceId);

    status.textContent = `Invoice #${invoiceId} — ${payments.length} payment(s)`;

    if (payments.length === 0) {
      list.textContent = "No payments recorded yet.";
      return;
    }

    for (const payment of payments) {
      const item = document.createElement("div");

      item.className =
        "flex justify-between gap-4 border-b border-stone-100 py-3 text-sm";

      const details = document.createElement("span");
      details.textContent =
        `Payment #${payment.payment_id} · ${payment.payment_date}`;

      const amount = document.createElement("strong");
      amount.textContent = formatMoney(payment.amount);

      item.append(details, amount);
      list.appendChild(item);
    }
  } catch (error) {
    status.textContent = "Could not load payment history.";
    console.error("Payment history failed:", error);
  }
}

refreshButton?.addEventListener("click", () => {
  void loadDashboard();
  void loadProjects();
  void loadInvoices();
  void loadProjectOptions();
  void loadProjectReports();
  void loadWebhookStats();
  void loadWebhookAlerts();
});

// Initial dashboard loading
void loadDashboard();
void loadProjects();
void loadInvoices();
void loadProjectOptions();
void loadProjectReports();
void loadWebhookStats();
void loadWebhookAlerts();
    // Automatically refresh webhook monitoring every 10 seconds
let isWebhookRefreshRunning = false;

setInterval(async () => {
  if (isWebhookRefreshRunning) {
    return;
  }

  isWebhookRefreshRunning = true;

  try {
    await Promise.all([
      loadWebhookStats(),
      loadWebhookAlerts(),
    ]);
  } finally {
    isWebhookRefreshRunning = false;
  }
}, 10000);

getProjects()
  .then((projects) => {
    console.log("Projects retrieved:", projects);
  })
  .catch((error) => {
    console.error("Could not retrieve projects:", error);
  });
function recordPayment(invoiceId: number, amount: string) {
  return (async (): Promise<void> => {
    const paymentAmount = amount.trim();

    if (
      !Number.isSafeInteger(invoiceId) ||
      invoiceId <= 0 ||
      !decimalPattern.test(paymentAmount) ||
      !Number.isFinite(Number(paymentAmount)) ||
      Number(paymentAmount) <= 0
    ) {
      throw new Error("Invalid invoice ID or payment amount.");
    }

    const response = await fetch(
      `${API_BASE_URL}/invoices/${invoiceId}/payments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ amount: paymentAmount }),
      }
    );

    if (!response.ok) {
      throw new Error(`Could not record payment: ${await response.text()}`);
    }
  })();
}

