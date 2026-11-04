import os
import pandas as pd

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from decimal import Decimal
from pydantic import BaseModel, Field
from typing import Literal

class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: Literal["active", "completed"] = "active"

class ProjectUpdate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: Literal["active", "completed"] = "active"

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

# Create a database engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

app = FastAPI()

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