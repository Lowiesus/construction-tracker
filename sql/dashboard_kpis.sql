WITH project_metrics AS (

    SELECT
        COUNT(*) AS total_projects,

        COUNT(*) FILTER (
            WHERE status = 'active'
        ) AS active_projects,

        COUNT(*) FILTER (
            WHERE status = 'completed'
        ) AS completed_projects,

        COALESCE(
            SUM(contract_value), 0
        ) AS total_contract_value

    FROM projects
),

invoice_metrics AS (

    SELECT
        COALESCE(SUM(amount), 0)
            AS total_invoiced,

        COALESCE(SUM(amount_paid), 0)
            AS total_paid,

        COALESCE(
            SUM(amount - amount_paid), 0
        ) AS outstanding_balance,

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