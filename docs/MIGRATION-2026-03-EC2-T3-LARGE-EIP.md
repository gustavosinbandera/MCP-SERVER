# EC2 Migration Runbook (t3.large + Elastic IP)

## Context

This migration was executed to stabilize the MCP platform after recurrent connectivity issues caused by:

- Public IP changes after restart/stop-start cycles.
- Memory pressure on `t3.medium` (4 GB RAM) with a full stack on one host:
  - MCP gateway + supervisor + webapp
  - Qdrant
  - Postgres
  - Keycloak
  - n8n + n8n-postgres
  - nginx + certbot + monitoring containers

## Goals

1. Keep all services on a single EC2 instance.
2. Preserve all data (especially Qdrant index data).
3. Increase RAM from 4 GB to 8 GB.
4. Make public access stable with a fixed Elastic IP.
5. Ensure MCP endpoint connectivity and document the correct URL paths.

## Final state (after migration)

- **Instance ID:** `i-0ddafdfe8b02ebbf4`
- **Instance type:** `t3.large`
- **Elastic IP:** `52.44.80.134`
- **Primary domains pointing to EIP:**
  - `mcp.domoticore.co`
  - `n8n.domoticore.co`
  - `auth.domoticore.co`

## Critical safety actions before resize

### 1) Root volume snapshot

Before changing instance type, create a root EBS snapshot.

```bash
aws ec2 create-snapshot \
  --volume-id <root-volume-id> \
  --description "pre-resize-mcp-instance-2026-03-10"
```

Snapshot created during this migration:

- `snap-01b51fc7860a75550`

### 2) Qdrant data integrity priority

Qdrant data (`mcp_docs`) is a hard requirement and must not be lost.

Validation performed post-migration:

```bash
curl -s http://localhost:6333/collections/mcp_docs
```

Observed values after migration:

- `status: ok`
- `points_count: 193246`
- `vectors_count: 193246`

## Why CloudFormation update was not used for resize

`change-set` preview for stack `mcp-hub-infra` showed `MCPInstance` replacement (`Replacement=True`) for this update path.

To avoid any risk to persistent data and service continuity, resize was performed directly at EC2 instance level:

1. Stop instance.
2. Modify instance type to `t3.large`.
3. Start instance.
4. Wait for status checks.

## Resize execution (safe path)

```bash
aws ec2 stop-instances --instance-ids i-0ddafdfe8b02ebbf4
aws ec2 wait instance-stopped --instance-ids i-0ddafdfe8b02ebbf4

aws ec2 modify-instance-attribute \
  --instance-id i-0ddafdfe8b02ebbf4 \
  --instance-type '{"Value":"t3.large"}'

aws ec2 start-instances --instance-ids i-0ddafdfe8b02ebbf4
aws ec2 wait instance-running --instance-ids i-0ddafdfe8b02ebbf4
aws ec2 wait instance-status-ok --instance-ids i-0ddafdfe8b02ebbf4
```

## Elastic IP setup (stability)

### 1) Allocate EIP

```bash
aws ec2 allocate-address --domain vpc
```

Allocated:

- `AllocationId: eipalloc-0be88ce5e45dfbe68`
- `PublicIp: 52.44.80.134`

### 2) Associate EIP to instance

```bash
aws ec2 associate-address \
  --instance-id i-0ddafdfe8b02ebbf4 \
  --allocation-id eipalloc-0be88ce5e45dfbe68
```

### 3) Update Route53 records

All A records were updated to the Elastic IP:

- `mcp.domoticore.co -> 52.44.80.134`
- `n8n.domoticore.co -> 52.44.80.134`
- `auth.domoticore.co -> 52.44.80.134`

## Endpoint map (important)

### MCP

- **Correct MCP endpoint (for clients):**
  - `https://mcp.domoticore.co/api/mcp`
- **Health endpoint:**
  - `https://mcp.domoticore.co/api/health`

Notes:

- `https://mcp.domoticore.co/mcp` returns `404` (wrong path).
- `https://mcp.domoticore.co/api/mcp` returns `401` without token (expected behavior).

### Web app

- `https://mcp.domoticore.co/`

### n8n

- `https://n8n.domoticore.co/`

### Auth / Keycloak domain

- `https://auth.domoticore.co/`

## Health-check behavior fix

`scripts/ec2/instance_update_with_verify.sh` was updated to avoid false rollbacks.

Old behavior:

- Verified only `http://localhost/api/health` and expected `200`.
- nginx commonly returns `302` in valid scenarios, causing false failure and unnecessary rollback.

New behavior:

- Checks both:
  - `http://localhost:3001/health` (gateway direct)
  - `http://localhost/api/health` (nginx route)
- Accepts success when:
  - gateway is `200`, or
  - api route is `200` or `302`

## Runtime validation checklist used

1. SSH to instance succeeds.
2. `docker compose ps` shows all required containers up.
3. `mcp-gateway` reports healthy.
4. `curl -k https://mcp.domoticore.co/api/health` returns `200`.
5. `curl -k https://mcp.domoticore.co/api/mcp` returns `401` without token (expected).
6. Qdrant collection `mcp_docs` has expected point count.
7. n8n containers (`n8n`, `n8n-postgres`) are running.

## Operational recommendations

1. Keep using domain names in configs/scripts instead of hardcoded public IPs.
2. Keep EIP attached to avoid connectivity break after restarts.
3. Do not run global compose restart in normal deploys; prefer service-scoped updates (`gateway`, `supervisor`) when possible.
4. For future capacity, monitor memory trend and consider:
   - adding swap (safety cushion),
   - moving Postgres to RDS if load grows.
