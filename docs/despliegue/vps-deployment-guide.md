# GUÍA DE DESPLIEGUE EN VPS Y BLINDAJE DE SEGURIDAD (PRODUCCIÓN)

Esta guía detalla el proceso para aprovisionar, endurecer y desplegar la plataforma SaaS en un servidor virtual privado (VPS) con máximos estándares de seguridad, bajo costo y alta disponibilidad.

---

## 1. Selección del VPS

### Opción A: Oracle Cloud Always Free (Recomendada - 100% Gratuita de por vida)
- **Instancia**: VM.Standard.A1.Flex (Procesador ARM Ampere Altra).
- **Especificaciones recomendadas**: 2 a 4 OCPUs, 12 a 24 GB de memoria RAM, 100 a 200 GB de disco NVMe.
- **Sistema Operativo**: Ubuntu 24.04 LTS (AArch64).
- **Costo**: $0 USD / mes permanente.

### Opción B: Hetzner Cloud (Alternativa Económica de Alto Rendimiento)
- **Instancia**: CPX21 (3 vCPU AMD, 4 GB RAM, 80 GB NVMe) o CX22 (~€4.50/mes).
- **Ubicación recomendada**: Ashburn (EE.UU.) o Núremberg (Alemania).
- **Sistema Operativo**: Ubuntu 24.04 LTS (x86_64).

---

## 2. Hardening del Servidor Linux (Paso a Paso)

Conéctate por SSH como `root` a la IP de tu VPS recién creado:

```bash
ssh root@IP_DE_TU_VPS
```

### A. Actualización del Sistema
```bash
apt update && apt upgrade -y
```

### B. Crear Usuario con Privilegios Sudo (No usar root)
```bash
# Crear usuario
adduser deployer

# Darle permisos de administrador
usermod -aG sudo deployer

# Copiar llaves SSH al nuevo usuario
mkdir -p /home/deployer/.ssh
cp /root/.ssh/authorized_keys /home/deployer/.ssh/
chown -R deployer:deployer /home/deployer/.ssh
chmod 700 /home/deployer/.ssh
chmod 600 /home/deployer/.ssh/authorized_keys
```

### C. Asegurar el Servicio SSH
Edita el archivo de configuración SSH:
```bash
nano /etc/ssh/sshd_config.d/security.conf
```
Añade las siguientes directivas:
```ini
# Deshabilitar acceso directo de root
PermitRootLogin no

# Deshabilitar acceso por contraseña (solo llaves criptográficas)
PasswordAuthentication no
PubkeyAuthentication yes

# Deshabilitar autenticación vacía
PermitEmptyPasswords no

# Reducir tiempo de gracia de login
LoginGraceTime 30
MaxAuthTries 3
```
Reinicia el servicio SSH:
```bash
systemctl restart ssh
```

> [!WARNING]
> **No cierres tu terminal actual** hasta abrir una nueva ventana y verificar que puedes conectarte con el nuevo usuario:
> `ssh deployer@IP_DE_TU_VPS`

### D. Configurar Firewall UFW
```bash
# Políticas por defecto: denegar entrantes, permitir salientes
ufw default deny incoming
ufw default allow outgoing

# Permitir SSH, HTTP y HTTPS
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'Caddy HTTP'
ufw allow 443/tcp comment 'Caddy HTTPS'
ufw allow 443/udp comment 'Caddy HTTP3 QUIC'

# Activar firewall
ufw enable
```

### E. Protección contra Fuerza Bruta (Fail2ban)
```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

---

## 3. Instalación de Docker y Docker Compose

Instala Docker desde el repositorio oficial:

```bash
# Dependencias previas
apt install -y ca-certificates curl gnupg

# Clave GPG oficial de Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Añadir repositorio a fuentes de apt
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine y Compose
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Permitir ejecutar docker al usuario deployer sin sudo
usermod -aG docker deployer
```

Cierra sesión y vuelve a entrar como `deployer` para refrescar los grupos.

---

## 4. Configuración del Perímetro en Cloudflare

1. **DNS**:
   - Crea un registro tipo `A` en Cloudflare:
     - **Nombre**: `app` (o `@` para raíz).
     - **IPv4**: La IP pública de tu VPS.
     - **Proxy status**: **Proxied (Nube Naranja activa)**. Esto oculta la IP real de tu servidor ante cualquier atacante.
2. **SSL / TLS**:
   - En el panel de Cloudflare, ve a **SSL/TLS** > selecciona el modo **Full (Strict)**.
3. **Seguridad / WAF**:
   - Ve a **Security** > **WAF** > **Rate Limiting Rules**:
     - Agrega una regla para limitar peticiones a `/login` (ejemplo: máximo 5 intentos por minuto por IP) para mitigar ataques de diccionario.

---

## 5. Puesta en Marcha de la Plataforma

Inicia sesión como `deployer` en el VPS:

```bash
# 1. Clonar el repositorio
git clone <URL_DE_TU_REPOSITORIO_GITHUB> /home/deployer/app
cd /home/deployer/app

# 2. Crear las variables de entorno de producción
cp .env.production.example .env

# 3. Editar variables con tus valores reales
nano .env
```
Asegúrate de definir:
- `DOMAIN`: tu dominio real configurado en Cloudflare (ej. `app.tudominio.com`).
- `POSTGRES_PASSWORD`: una contraseña robusta de al menos 32 caracteres alfanuméricos.
- `AUTH_SECRET`: generado con el comando `openssl rand -base64 32`.

### Arranque de Contenedores
```bash
docker compose up -d --build
```

### Inicialización de Base de Datos y Portafolio de CARCAR
Al levantar los contenedores con `docker compose up -d`, las migraciones de Prisma se ejecutan **automáticamente** al arrancar el contenedor `web`.

Para verificar o importar el portafolio de CARCAR (o ejecutar migraciones manuales si fuera necesario):

```bash
# (Opcional) Verificar o re-ejecutar migraciones de Prisma manualmente:
docker compose exec web npm run db:migrate

# Importar las 121 unidades del portafolio de CARCAR y crear el usuario OWNER:
docker compose exec web npm run db:import:carcar
```

### Importar ocupación (inquilinos, contratos y servicio de luz)
Los archivos de ocupación traen datos personales y **no viajan con git**
(viven en `docs/clientes/<cliente>/privado/`). Se copian a mano, se importan y se borran.

```bash
# 1. Desde tu computadora: subir el archivo al servidor
scp docs/clientes/carcar/privado/chichen-ocupacion.json usuario@servidor:/tmp/

# 2. En el servidor: pasarlo al contenedor y respaldar la base antes de cargar
docker compose cp /tmp/chichen-ocupacion.json web:/tmp/chichen-ocupacion.json
docker compose exec db-backup sh /backup-db.sh

# 3. Simular (no guarda nada) y revisar el reporte
docker compose exec web npm run db:import:ocupacion -- /tmp/chichen-ocupacion.json

# 4. Aplicar
docker compose exec web npm run db:import:ocupacion -- /tmp/chichen-ocupacion.json --apply

# 5. Borrar el archivo del contenedor y del servidor
docker compose exec -u root web rm /tmp/chichen-ocupacion.json
rm /tmp/chichen-ocupacion.json
```

Correrlo dos veces no duplica datos. Los contratos vencidos quedan como terminados
y se renuevan desde la ficha del inquilino (botón **Renovar**).

---

## 6. Monitoreo y Mantenimiento

### Ver estado y logs de los contenedores
```bash
# Ver estado de los servicios
docker compose ps

# Ver logs en tiempo real de Next.js
docker compose logs -f web

# Ver logs del proxy Caddy
docker compose logs -f caddy
```

### Actualización de Versión (Zero-Downtime)
Cuando publiques una nueva versión en GitHub:
```bash
cd /home/deployer/app
git pull origin main
docker compose up -d --build
```

### Respaldos
Los respaldos se generan automáticamente todas las noches a las 3:00 AM UTC en el volumen `db_backups`. Puedes listar los respaldos en cualquier momento:
```bash
docker compose exec db-backup ls -lh /backups
```
