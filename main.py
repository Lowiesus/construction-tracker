
import os
import pandas as pd

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from decimal import Decimal
from pydantic import BaseModel, Field

class ProjectCreate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: str = "active"

class ProjectUpdate(BaseModel):
    project_name: str = Field(min_length=1)
    contract_value: Decimal = Field(gt=0)
    status: str = "active"

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

# Create a database engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

app = FastAPI()

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