#!/bin/bash
set -e
cd "$(dirname "$0")/../.."
BODY='{"client_name":"mcp-chatgpt","redirect_uris":["https://chatgpt.com/connector/oauth/s049mmGeQhY2"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}'
echo "$BODY" | docker compose exec -T gateway curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3001/realms/mcp/clients-registrations/openid-connect -H "Content-Type: application/json" -d @-
