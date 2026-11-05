import os
import pandas as pd
import requests
import logging
import json

from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

from sqlalchemy import create_engine, text
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from decimal import Decimal
from pydantic import BaseModel, Field
from typing import Literal
from datetime import date
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from apscheduler.schedulers.background import BackgroundScheduler

class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: Literal["active", "completed"] = "active"

class InvoiceCreate(BaseModel):
    project_id: int = Field(gt=0)
    amount: Decimal = Field(gt=0)
    due_date: date

class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0)

class ProjectUpdate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: Literal["active", "completed"] = "active"

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

# Create a database engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
N8N_INVOICE_WEBHOOK_URL = os.getenv("N8N_INVOICE_WEBHOOK_URL")
N8N_WEBHOOK_SECRET = os.getenv("N8N_WEBHOOK_SECRET")
MAX_WEBHOOK_ATTEMPTS = 5

retry_strategy = Retry(
    total=3,
    connect=3,
    read=0,
    status=3,
    backoff_factor=1,
    status_forcelist=[500, 502, 503, 504],
    allowed_methods=["POST"],
)

http_session = requests.Session()
adapter = HTTPAdapter(max_retries=retry_strategy)
http_session.mount("http://", adapter)
http_session.mount("https://", adapter)

def save_failed_webhook(invoice_data: dict, error: Exception):
    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO webhook_outbox (
                        event_type,
                        payload,
                        status,
                        attempts,
                        last_error
                    )
                    VALUES (
                        'invoice.created',
                        CAST(:payload AS JSONB),
                        'pending',
                        1,
                        :last_error
                    )
                """),
                {
                    "payload": json.dumps(invoice_data),
                    "last_error": str(error)
                }
            )

        logging.warning(
            "Failed invoice webhook saved to the retry queue."
        )

    except Exception:
        logging.exception(
            "Could not save failed webhook to the retry queue."
        )

def process_pending_webhooks():
    with engine.begin() as connection:
        connection.execute(
            text("""
                UPDATE webhook_outbox
                SET status = 'failed'
                WHERE status = 'pending'
                  AND attempts >= :max_attempts
            """),
            {"max_attempts": MAX_WEBHOOK_ATTEMPTS}
        )
    with engine.connect() as connection:
        pending_events = connection.execute(
            text("""
                SELECT event_id, payload
                FROM webhook_outbox
                WHERE status = 'pending'
                AND attempts < :max_attempts
                ORDER BY event_id
                LIMIT 50
            """),
            {"max_attempts": MAX_WEBHOOK_ATTEMPTS}
        ).mappings().all()

    for event in pending_events:
        try:
            response = http_session.post(
                N8N_INVOICE_WEBHOOK_URL,
                json=event["payload"],
                headers={
                    "X-Webhook-Secret": N8N_WEBHOOK_SECRET
                },
                timeout=5
            )

            response.raise_for_status()

            with engine.begin() as connection:
                connection.execute(
                    text("""
                        UPDATE webhook_outbox
                        SET status = 'sent',
                            attempts = attempts + 1,
                            sent_at = CURRENT_TIMESTAMP,
                            last_error = NULL
                        WHERE event_id = :event_id
                    """),
                    {"event_id": event["event_id"]}
                )

            logging.info(
                "Pending webhook %s successfully delivered.",
                event["event_id"]
            )

        except requests.RequestException as error:
            with engine.begin() as connection:
                connection.execute(
                    text("""
                        UPDATE webhook_outbox
                        SET attempts = attempts + 1,
                            last_error = :error
                        WHERE event_id = :event_id
                    """),
                    {
                        "event_id": event["event_id"],
                        "error": str(error)
                    }
                )

            logging.error(
                "Pending webhook %s delivery failed: %s",
                event["event_id"],
                error
            )

def send_invoice_to_n8n(invoice_data: dict):
    if not N8N_INVOICE_WEBHOOK_URL:
        logging.error("n8n webhook URL is not configured.")
        return

    if not N8N_WEBHOOK_SECRET:
        logging.error("n8n webhook secret is not configured.")
        return

    try:
        response = http_session.post(
            N8N_INVOICE_WEBHOOK_URL,
            json=invoice_data,
            headers={
                "X-Webhook-Secret": N8N_WEBHOOK_SECRET
            },
            timeout=5
        )

        response.raise_for_status()
        logging.info("Invoice successfully sent to n8n.")

    except requests.RequestException as error:
        logging.error("Failed to send invoice to n8n: %s", error)
        raise

app = FastAPI()
scheduler = BackgroundScheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://127.0.0.1:5173",
                   ],
    allow_credentials=False,
    allow_methods=["GET" , "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

with engine.begin() as connection:
    result = connection.execute(
        text("""
            UPDATE projects
            SET contract_value = :new_value
            WHERE project_name = :project_name;
        """),
        {
            "new_value": 360000,
            "project_name": "Office Extension"
        }
    )

    print("Rows updated:", result.rowcount)


with engine.connect() as connection:
    df = pd.read_sql_query(
        text("""
            SELECT *
            FROM projects
            ORDER BY project_id;
        """),
        connection
    )

print(df.groupby("status")["contract_value"].sum())


# Open a connection
with engine.connect() as connection:
    result = connection.execute(
        text("SELECT version();")
    )

    print(result.scalar())

#endpoints
@app.get("/reports/projects")
def get_project_reports():

    with engine.connect() as connection:

        result = connection.execute(
            text("""
                WITH invoice_metrics AS (
                    SELECT
                        project_id,
                        COUNT(*) AS invoice_count,
                        COALESCE(SUM(amount), 0) AS total_invoiced,
                        COALESCE(SUM(amount_paid), 0) AS total_paid,
                        COALESCE(
                            SUM(amount - amount_paid), 0
                        ) AS outstanding_balance
                    FROM invoices
                    GROUP BY project_id
                )

                SELECT
                    p.project_id,
                    p.project_name,
                    p.status,
                    p.contract_value,
                    COALESCE(im.invoice_count, 0) AS invoice_count,
                    COALESCE(im.total_invoiced, 0) AS total_invoiced,
                    COALESCE(im.total_paid, 0) AS total_paid,
                    COALESCE(im.outstanding_balance, 0)
                        AS outstanding_balance

                FROM projects p

                LEFT JOIN invoice_metrics im
                    ON p.project_id = im.project_id

                ORDER BY p.project_id;
            """)
        )

        reports = result.mappings().all()

    return [
        {
            "project_id": report["project_id"],
            "project_name": report["project_name"],
            "status": report["status"],
            "contract_value": str(report["contract_value"]),
            "invoice_count": report["invoice_count"],
            "total_invoiced": str(report["total_invoiced"]),
            "total_paid": str(report["total_paid"]),
            "outstanding_balance": str(
                report["outstanding_balance"]
            )
        }
        for report in reports
    ]

@app.post("/projects")
def create_project(project: ProjectCreate):

    with engine.begin() as connection:

        result = connection.execute(
            text("""
                INSERT INTO projects (
                    project_name,
                    contract_value,
                    status
                )
                VALUES (
                    :project_name,
                    :contract_value,
                    :status
                )
                RETURNING
                    project_id,
                    project_name,
                    contract_value,
                    status
            """),
            {
                "project_name": project.project_name,
                "contract_value": project.contract_value,
                "status": project.status
            }
        )

        new_project = dict(result.mappings().one())

    return new_project

@app.put("/projects/{project_id}")
def update_project(project_id: int, project: ProjectUpdate):

    with engine.begin() as connection:

        result = connection.execute(
            text("""
                UPDATE projects
                SET
                    project_name = :project_name,
                    contract_value = :contract_value,
                    status = :status
                WHERE project_id = :project_id
                RETURNING *
            """),
            {
                "project_id": project_id,
                "project_name": project.project_name,
                "contract_value": project.contract_value,
                "status": project.status
            }
        )

        updated_project = result.mappings().first()

        if updated_project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

    return dict(updated_project)

@app.delete("/projects/{project_id}")
def delete_project(project_id: int):

    with engine.begin() as connection:

        result = connection.execute(
            text("""
                DELETE FROM projects
                WHERE project_id = :project_id
                RETURNING project_id
            """),
            {"project_id": project_id}
        )

        deleted_project = result.mappings().first()

        if deleted_project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

    return {
        "message": "Project deleted successfully",
        "project_id": deleted_project["project_id"]
    }

@app.get("/dashboard/summary")
def get_dashboard_summary():
    query = text("""
        WITH project_metrics AS (
            SELECT
                COUNT(*) AS total_projects,

                COUNT(*) FILTER (
                    WHERE status = 'active'
                ) AS active_projects,

                COUNT(*) FILTER (
                    WHERE status = 'completed'
                ) AS completed_projects,

                COALESCE(SUM(contract_value), 0)
                    AS total_contract_value

            FROM projects
        ),

        invoice_metrics AS (
            SELECT
                COALESCE(SUM(amount), 0)
                    AS total_invoiced,

                COALESCE(SUM(amount_paid), 0)
                    AS total_paid,

                COALESCE(SUM(amount - amount_paid), 0)
                    AS outstanding_balance,

                COUNT(*) FILTER (
                    WHERE amount > amount_paid
                ) AS unpaid_invoice_count,

                COUNT(*) FILTER (
                    WHERE due_date < CURRENT_DATE
                    AND amount > amount_paid
                ) AS overdue_invoice_count,

                COALESCE(
                    SUM(amount - amount_paid) FILTER (
                        WHERE due_date < CURRENT_DATE
                        AND amount > amount_paid
                    ), 0
                ) AS overdue_balance

            FROM invoices
        )

        SELECT *
        FROM project_metrics
        CROSS JOIN invoice_metrics;
    """)

    with engine.connect() as connection:
        result = connection.execute(query)
        metrics = result.mappings().one()

    return {
        "total_projects": metrics["total_projects"],
        "active_projects": metrics["active_projects"],
        "completed_projects": metrics["completed_projects"],

        "total_contract_value": str(metrics["total_contract_value"]),
        "total_invoiced": str(metrics["total_invoiced"]),
        "total_paid": str(metrics["total_paid"]),
        "outstanding_balance": str(metrics["outstanding_balance"]),

        "unpaid_invoice_count": metrics["unpaid_invoice_count"],
        "overdue_invoice_count": metrics["overdue_invoice_count"],
        "overdue_balance": str(metrics["overdue_balance"])
    }

@app.get("/projects")
def get_projects():

    with engine.connect() as connection:

        result = connection.execute(
            text("""
                SELECT
                    project_id,
                    project_name,
                    contract_value,
                    status
                FROM projects
                ORDER BY project_id;
            """)
        )

        projects = result.mappings().all()

    return [
        {
            "project_id": project["project_id"],
            "project_name": project["project_name"],
            "contract_value": str(project["contract_value"]),
            "status": project["status"]
        }
        for project in projects
    ]

@app.get("/invoices")
def get_invoices():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    i.invoice_id,
                    i.project_id,
                    p.project_name,
                    i.amount,
                    i.due_date,
                    i.amount_paid,
                    i.amount - i.amount_paid AS outstanding_balance
                FROM invoices i
                JOIN projects p
                    ON i.project_id = p.project_id
                ORDER BY i.due_date;
            """)
        )

        invoices = result.mappings().all()

    return [
        {
            "invoice_id": invoice["invoice_id"],
            "project_id": invoice["project_id"],
            "project_name": invoice["project_name"],
            "amount": str(invoice["amount"]),
            "due_date": str(invoice["due_date"]),
            "amount_paid": str(invoice["amount_paid"]),
            "outstanding_balance": str(invoice["outstanding_balance"])
        }
        for invoice in invoices
    ]

@app.get("/webhook-stats")
def get_webhook_stats():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    COUNT(*) AS total_events,

                    COUNT(*) FILTER (
                        WHERE status = 'pending'
                    ) AS pending_events,

                    COUNT(*) FILTER (
                        WHERE status = 'sent'
                    ) AS sent_events,

                    COUNT(*) FILTER (
                        WHERE status = 'failed'
                    ) AS failed_events,

                    COALESCE(SUM(attempts), 0) AS total_attempts

                FROM webhook_outbox;
            """)
        ).mappings().one()

    return {
        "total_events": result["total_events"],
        "pending_events": result["pending_events"],
        "sent_events": result["sent_events"],
        "failed_events": result["failed_events"],
        "total_attempts": result["total_attempts"]
    }

@app.post("/invoices")
def create_invoice(invoice: InvoiceCreate):
    with engine.begin() as connection:
        project = connection.execute(
            text("""
                SELECT project_id, project_name
                FROM projects
                WHERE project_id = :project_id
            """),
            {"project_id": invoice.project_id}
        ).mappings().first()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        result = connection.execute(
            text("""
                INSERT INTO invoices (
                    project_id,
                    amount,
                    due_date,
                    amount_paid
                )
                VALUES (
                    :project_id,
                    :amount,
                    :due_date,
                    0
                )
                RETURNING invoice_id, project_id, amount, due_date, amount_paid
            """),
            {
                "project_id": invoice.project_id,
                "amount": invoice.amount,
                "due_date": invoice.due_date,
            }
        ).mappings().one()

        project_name = connection.execute(
            text("""
                SELECT project_name
                FROM projects
                WHERE project_id = :project_id
            """),
            {"project_id": invoice.project_id}
        ).scalar_one()

    # Prepare the invoice data after the transaction commits.
    invoice_data = {
        "event_id": result["invoice_id"],
        "invoice_id": result["invoice_id"],
        "project_id": result["project_id"],
        "project_name": project_name,
        "amount": str(result["amount"]),
        "due_date": str(result["due_date"]),
        "amount_paid": str(result["amount_paid"]),
    }

    # Send the invoice information to n8n.
    try:
        send_invoice_to_n8n(invoice_data)
    except requests.RequestException as error:
        logging.error("Failed to send invoice to n8n: %s", error)
        save_failed_webhook(invoice_data, error)

    return invoice_data


@app.post("/invoices/{invoice_id}/payments")
def record_payment(invoice_id: int, payment: PaymentCreate):

    with engine.begin() as connection:

        # Step 1: Update the invoice's paid amount
        result = connection.execute(
            text("""
                UPDATE invoices
                SET amount_paid = amount_paid + :payment_amount
                WHERE invoice_id = :invoice_id
                  AND amount_paid + :payment_amount <= amount
                RETURNING
                    invoice_id,
                    amount,
                    amount_paid,
                    amount - amount_paid AS outstanding_balance
            """),
            {
                "invoice_id": invoice_id,
                "payment_amount": payment.amount
            }
        )

        invoice = result.mappings().first()

        # Step 2: Check why the update did not happen
        if invoice is None:

            exists = connection.execute(
                text("""
                    SELECT invoice_id
                    FROM invoices
                    WHERE invoice_id = :invoice_id
                """),
                {"invoice_id": invoice_id}
            ).first()

            if exists is None:
                raise HTTPException(
                    status_code=404,
                    detail="Invoice not found"
                )

            raise HTTPException(
                status_code=400,
                detail="Payment exceeds outstanding balance"
            )

        # Step 3: Insert the individual payment record
        payment_result = connection.execute(
            text("""
                INSERT INTO payments (
                    invoice_id,
                    amount
                )
                VALUES (
                    :invoice_id,
                    :amount
                )
                RETURNING payment_id, payment_date
            """),
            {
                "invoice_id": invoice_id,
                "amount": payment.amount
            }
        )

        payment_record = payment_result.mappings().one()

    # Step 4: Return the updated information
    return {
        "payment_id": payment_record["payment_id"],
        "invoice_id": invoice["invoice_id"],
        "payment_amount": str(payment.amount),
        "payment_date": str(payment_record["payment_date"]),
        "invoice_amount": str(invoice["amount"]),
        "amount_paid": str(invoice["amount_paid"]),
        "outstanding_balance": str(invoice["outstanding_balance"])
    }

@app.post("/invoices/{invoice_id}/payments")
def record_invoice_payment(invoice_id: int, payment: PaymentCreate):
    with engine.begin() as connection:
        invoice = connection.execute(
            text("""
                SELECT amount, amount_paid
                FROM invoices
                WHERE invoice_id = :invoice_id
                FOR UPDATE
            """),
            {"invoice_id": invoice_id}
        ).mappings().first()

        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")

        outstanding_balance = invoice["amount"] - invoice["amount_paid"]
        if payment.amount > outstanding_balance:
            raise HTTPException(
                status_code=400,
                detail="Payment cannot exceed the outstanding balance"
            )

        result = connection.execute(
            text("""
                UPDATE invoices
                SET amount_paid = amount_paid + :amount
                WHERE invoice_id = :invoice_id
                RETURNING invoice_id, amount_paid, amount - amount_paid AS outstanding_balance
            """),
            {"invoice_id": invoice_id, "amount": payment.amount}
        ).mappings().one()

    return {
        "invoice_id": result["invoice_id"],
        "amount_paid": str(result["amount_paid"]),
        "outstanding_balance": str(result["outstanding_balance"]),
    }

@app.get("/invoices/{invoice_id}/payments")
def get_invoice_payments(invoice_id: int):

    with engine.connect() as connection:

        invoice = connection.execute(
            text("""
                SELECT invoice_id
                FROM invoices
                WHERE invoice_id = :invoice_id
            """),
            {"invoice_id": invoice_id}
        ).first()

        if invoice is None:
            raise HTTPException(
                status_code=404,
                detail="Invoice not found"
            )

        result = connection.execute(
            text("""
                SELECT
                    payment_id,
                    invoice_id,
                    amount,
                    payment_date
                FROM payments
                WHERE invoice_id = :invoice_id
                ORDER BY payment_date DESC, payment_id DESC
            """),
            {"invoice_id": invoice_id}
        )

        payments = result.mappings().all()

    return [
        {
            "payment_id": payment["payment_id"],
            "invoice_id": payment["invoice_id"],
            "amount": str(payment["amount"]),
            "payment_date": str(payment["payment_date"])
        }
        for payment in payments
    ]

@app.on_event("startup")
def start_scheduler():
    scheduler.add_job(
        process_pending_webhooks,
        trigger="interval",
        seconds=30,
        id="pending_webhook_processor",
        replace_existing=True,
        max_instances=1
    )

    scheduler.start()
    logging.info("Webhook retry scheduler started.")


@app.on_event("shutdown")
def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logging.info("Webhook retry scheduler stopped.")
