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

interface Invoice {
  invoice_id: number;
  project_id: number;
  project_name: string;
  amount: string;
  due_date: string;
  amount_paid: string;
  outstanding_balance: string;
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

const invoicesStatus =
  document.querySelector<HTMLParagraphElement>("#invoices-status");

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

function renderInvoices(invoices: Invoice[]): void {
  if (!invoicesTableBody) return;

  invoicesTableBody.replaceChildren();

  if (invoices.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 6;
    cell.className = "px-4 py-6 text-center text-slate-500";
    cell.textContent = "No invoices found.";

    row.appendChild(cell);
    invoicesTableBody.appendChild(row);
    return;
  }

  for (const invoice of invoices) {
    const row = document.createElement("tr");
    row.className = "border-t border-stone-100";

    const invoiceIdCell = document.createElement("td");
    invoiceIdCell.className = "px-4 py-3";
    invoiceIdCell.textContent = String(invoice.invoice_id);

    const projectCell = document.createElement("td");
    projectCell.className = "px-4 py-3 font-medium";
    projectCell.textContent = invoice.project_name;

    const amountCell = document.createElement("td");
    amountCell.className = "px-4 py-3";
    amountCell.textContent = formatMoney(invoice.amount);

    const dueDateCell = document.createElement("td");
    dueDateCell.className = "px-4 py-3";

    const dueDate = new Date(`${invoice.due_date}T00:00:00`);

    dueDateCell.textContent = Number.isNaN(dueDate.getTime())
      ? invoice.due_date
      : dueDate.toLocaleDateString("en-PH");

    const paidCell = document.createElement("td");
    paidCell.className = "px-4 py-3";
    paidCell.textContent = formatMoney(invoice.amount_paid);

    const outstandingCell = document.createElement("td");
    outstandingCell.className = "px-4 py-3 font-semibold";
    outstandingCell.textContent = formatMoney(invoice.outstanding_balance);

    row.append(
      invoiceIdCell,
      projectCell,
      amountCell,
      dueDateCell,
      paidCell,
      outstandingCell
    );

    invoicesTableBody.appendChild(row);
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

      await Promise.all([loadProjects(), loadDashboard()]);
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

await Promise.all([loadProjects(), loadDashboard()]);
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

refreshButton?.addEventListener("click", () => {
  void loadDashboard();
  void loadProjects();
  void loadInvoices();
});

void loadDashboard();
void loadProjects();
void loadInvoices();
getProjects()
  .then((projects) => {
    console.log("Projects retrieved:", projects);
  })
  .catch((error) => {
    console.error("Could not retrieve projects:", error);
  });
