from pathlib import Path


p = Path('/home/ec2-user/MCP-SERVER/nginx/nginx.conf')
text = p.read_text(encoding='utf-8')

if 'server_name n8n.domoticore.co;' in text:
    print('already present')
else:
    block = '''
    server {
        listen 443 ssl;
        server_name n8n.domoticore.co;

        ssl_certificate     /etc/letsencrypt/live/n8n.domoticore.co/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/n8n.domoticore.co/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        location / {
            proxy_pass http://172.18.0.1:5678;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }
'''
    marker = '\n    # HTTPS: auth.domoticore.co → Keycloak + DCR proxy al gateway\n'
    text = text.replace(marker, '\n' + block + '\n' + marker)
    p.write_text(text, encoding='utf-8')
    print('inserted')
