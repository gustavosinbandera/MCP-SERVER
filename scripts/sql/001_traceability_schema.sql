-- MCP Knowledge Hub - Traceability Schema
-- Stores developer contributions, document metadata, Qdrant references

CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    developer_identity VARCHAR(255) NOT NULL,
    bug_id VARCHAR(100),
    repo VARCHAR(255),
    project VARCHAR(255),
    branch VARCHAR(255),
    build VARCHAR(100),
    files_touched TEXT[],
    document_hash VARCHAR(64),
    qdrant_point_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_developer ON submissions(developer_identity);
CREATE INDEX IF NOT EXISTS idx_submissions_bug_id ON submissions(bug_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_qdrant ON submissions(qdrant_point_id);

-- Trace logs for detailed audit
CREATE TABLE IF NOT EXISTS trace_logs (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER REFERENCES submissions(id),
    action VARCHAR(50) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trace_logs_submission ON trace_logs(submission_id);
