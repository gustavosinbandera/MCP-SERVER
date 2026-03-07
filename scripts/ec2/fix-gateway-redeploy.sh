#!/usr/bin/env bash
# Run this ON the EC2 instance (e.g. after ssh ec2-user@52.91.217.181) to redeploy
# the gateway with the reverted code. Fixes gateway after revert was pushed.
set -e
cd ~/MCP-SERVER
git fetch origin
git checkout master
git pull origin master
docker compose build gateway
docker compose up -d gateway
docker compose ps gateway
echo "--- Last gateway logs ---"
docker compose logs gateway --tail 20
