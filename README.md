# Construction Tracker

A local dashboard for tracking construction projects, contract values, invoices,
payments, outstanding balances, and invoice-webhook delivery. The frontend is a
Vite/TypeScript app; the API is FastAPI backed by PostgreSQL.

## Features

- Project summary metrics and per-project financial reports
- Create, edit, and delete projects
- Create invoices and record/view invoice payments
- Overdue and outstanding invoice tracking
- Optional n8n invoice webhook delivery with a retry queue and alert monitoring
- Currency and dates displayed using Philippine conventions (PHP / `en-PH`)

## Requirements

- Python and pip
- Node.js and npm
- PostgreSQL
- An n8n webhook and shared secret if invoice webhook delivery is needed

## Database setup

Create a PostgreSQL database and make it accessible to the backend. The API
expects these tables to exist before it starts:

- `projects`: `project_id`, `project_name`, `contract_value`, `status`
- `invoices`: `invoice_id`, `project_id`, `amount`, `due_date`, `amount_paid`
- `payments`: `payment_id`, `invoice_id`, `amount`, `payment_date`
- `webhook_outbox`: `event_id`, `event_type`, `payload` (JSONB), `status`,
  `attempts`, `last_error`, `sent_at`
- `webhook_alerts`: `alert_id`, `event_id`, `alert_type`, `message`,
  `created_at`, `acknowledged_at`

Use numeric/decimal types for monetary values. Project statuses used by the API
are `active` and `completed`. The repository does not currently include table
creation or sample-data statements: `sql/create_tables.sql` and
`sql/sample_data.sql` are empty. `sql/dashboard_kpis.sql` contains the dashboard
metrics query only; it does not initialize the database.

## Backend configuration and startup

Create a `.env` file in the repository root:

```dotenv
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/construction_tracker
N8N_INVOICE_WEBHOOK_URL=https://your-n8n-host/webhook/your-webhook-id
N8N_WEBHOOK_SECRET=replace-with-a-shared-secret
```

`DATABASE_URL` is required. Set both n8n values to enable invoice webhook
delivery; the API can still create invoices when webhook delivery is not
configured. Keep `.env` and webhook secrets out of source control.

Install the backend dependencies and start the API from the repository root:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi "uvicorn[standard]" sqlalchemy "psycopg[binary]" pandas requests python-dotenv apscheduler
uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Interactive API
documentation is at `http://127.0.0.1:8000/docs`.

## Frontend setup and startup

In another terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

The dashboard is served at `http://localhost:5173`. The example frontend
configuration points to `http://127.0.0.1:8000`; change
`VITE_API_BASE_URL` in `frontend/.env.local` if the API is hosted elsewhere.
The backend CORS configuration currently allows the two local Vite origins
(`localhost:5173` and `127.0.0.1:5173`).

To type-check and create a production frontend build:

```powershell
npm run build
```

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/dashboard/summary` | Dashboard KPIs |
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Create a project |
| `PUT` | `/projects/{project_id}` | Update a project |
| `DELETE` | `/projects/{project_id}` | Delete a project |
| `GET` | `/reports/projects` | Project invoice/payment totals |
| `GET` | `/invoices` | List invoices and balances |
| `POST` | `/invoices` | Create an invoice |
| `POST` | `/invoices/{invoice_id}/payments` | Record a payment |
| `GET` | `/invoices/{invoice_id}/payments` | List payment history |
| `GET` | `/webhook-stats` | Webhook delivery counts |
| `GET` | `/webhook-alerts` | List webhook alerts |
| `PATCH` | `/webhook-alerts/{alert_id}/acknowledge` | Acknowledge an alert |

Invoice creation sends a JSON event to the configured n8n URL with the
`X-Webhook-Secret` header. Failed deliveries are placed in `webhook_outbox`;
the API's background scheduler retries pending events every 30 seconds, up to
five attempts, and creates alerts for exhausted events.
