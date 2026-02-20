# Reporte de servicios – EC2 MCP Knowledge Hub

**Fecha:** 2026-02-20  
**Host:** 52.91.217.181 (mcp.domoticore.co)  
**Revisión:** SSH + Docker + puertos

---

## 1. SSH (sshd)

| Estado | Valor |
|--------|--------|
| **Servicio** | active |
| **Puerto** | 22 (0.0.0.0:22, [::]:22) |
| **Proceso** | sshd (PID 1673) |

**Conclusión:** SSH operativo; acceso remoto disponible.

---

## 2. Contenedores Docker (docker compose)

| Contenedor   | Imagen              | Estado   | Salud   | Puertos expuestos        |
|-------------|---------------------|----------|---------|---------------------------|
| mcp-gateway | mcp-server-gateway   | Up 27 min | healthy | 3001 (solo red interna)   |
| mcp-nginx   | mcp-server-nginx     | Up 27 min | -       | **80** → 80               |
| mcp-postgres| postgres:15-alpine   | Up 27 min | healthy | 5432                      |
| mcp-qdrant  | qdrant/qdrant:v1.7.4 | Up 27 min | healthy | 6333                      |
| mcp-redis   | redis:7-alpine       | Up 27 min | healthy | 6379                      |
| mcp-webapp  | mcp-server-webapp    | Up 27 min | -       | 3000 (solo red interna)   |

**Conclusión:** Stack completo en ejecución; gateway, postgres, qdrant y redis en estado healthy.

---

## 3. Puertos en escucha

| Puerto | Proceso     | Uso                    |
|--------|-------------|------------------------|
| 22     | sshd        | SSH                    |
| 80     | docker-proxy| Nginx (HTTP)           |
| 5432   | docker-proxy| Postgres               |
| 6333   | docker-proxy| Qdrant                 |
| 6379   | docker-proxy| Redis                  |

**Conclusión:** Solo los puertos esperados están abiertos; 80 es el único expuesto al público (además de 22).

---

## 4. Comprobación HTTP

| URL                    | Código HTTP |
|------------------------|-------------|
| http://localhost/api/health (gateway) | 200         |
| http://localhost/ (webapp vía nginx)  | 200         |

**Conclusión:** Gateway y webapp responden correctamente en la EC2.

---

## 5. Resumen

- **SSH:** Activo; acceso por clave (mcp-server-key.pem) a ec2-user@52.91.217.181.
- **Aplicación:** Nginx en 80, gateway detrás de /api/, webapp en /. Todos los servicios del compose están Up y los que tienen healthcheck están healthy.
- **Recomendación:** Estado correcto para uso. Para HTTPS, configurar Certbot en la VM o un ALB con certificado ACM.
