#!/usr/bin/env bash
# Instalador de util scripts en la instancia EC2.
# Crea /opt/mcp-tools, copia util_* desde el repo, symlinks y profile.d.
# Ejecutar desde la raíz del repo: sudo bash scripts/ec2/install-tools.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOLS_DIR="/opt/mcp-tools"
PROFILE_D="/etc/profile.d/mcp-tools.sh"

if [[ ! -d "$REPO_ROOT/scripts/ec2" ]]; then
  echo "Error: no se encuentra scripts/ec2 en $REPO_ROOT"
  exit 1
fi

echo "Repo: $REPO_ROOT"
echo "Destino: $TOOLS_DIR"

echo "Creando $TOOLS_DIR..."
sudo mkdir -p "$TOOLS_DIR"

echo "Copiando util_update_repo..."
sudo cp "$REPO_ROOT/scripts/ec2/util_update_repo" "$TOOLS_DIR/util_update_repo"
sudo chmod +x "$TOOLS_DIR/util_update_repo"

echo "Creando symlinks update-repo y actualizar-repo..."
sudo ln -sf util_update_repo "$TOOLS_DIR/update-repo"
sudo ln -sf util_update_repo "$TOOLS_DIR/actualizar-repo"

echo "Creando $PROFILE_D (PATH + aliases con espacio)..."
sudo tee "$PROFILE_D" > /dev/null << 'PROFILE'
# MCP util scripts
export PATH="/opt/mcp-tools:$PATH"
alias "update repo"='util_update_repo'
alias "actualizar repo"='util_update_repo'
PROFILE

echo "Listo. Para usar los comandos:"
echo "  - Cierra y reabre la sesión SSH, o ejecuta: source $PROFILE_D"
echo "  - Comandos: util_update_repo, update-repo, actualizar-repo, \"update repo\", \"actualizar repo\""
