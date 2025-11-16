<p align="center">
  <img src="https://img.icons8.com/color/200/telegram-app--v1.png" alt="Telegram Bot" width="120"/>
</p>

<h1 align="center">🤖 Bot Telegram Personal</h1>

<p align="center">
  <strong>Tu asistente personal inteligente en Telegram</strong>
</p>

<p align="center">
  <a href="#features">Características</a> •
  <a href="#tech-stack">Tecnologías</a> •
  <a href="#installation">Instalación</a> •
  <a href="#usage">Uso</a> •
  <a href="#commands">Comandos</a> •
  <a href="#docker">Docker</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma"/>
  <img src="https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

---

## 📋 Descripción

Bot de Telegram personal desarrollado con **NestJS** que integra múltiples servicios útiles para el día a día. Desde consultar el saldo de tu tarjeta Transcaribe, verificar el Pico y Placa en Cartagena, hasta gestionar recordatorios y ejecutar operaciones DevOps remotas.

<h2 id="features">✨ Características</h2>

### 🚍 **Módulo Transcaribe**
- 💳 Consulta el saldo de tu tarjeta
- 📊 Revisa el historial de transacciones
- 🔔 Recibe notificaciones automáticas

### 🚗 **Módulo Pico y Placa**
- ⚠️ Consulta las restricciones del día
- 🚙 Registra tus vehículos
- 📱 Recibe alertas personalizadas según tu placa

### 📅 **Módulo de Recordatorios**
- ⏰ Crea recordatorios personalizados
- 📝 Gestiona tus tareas pendientes
- 🔔 Notificaciones programadas

### 🔧 **Módulo DevOps**
- 🌐 Actualización automática de DNS
- 🔌 Ejecución remota de scripts vía SSH
- 🐳 Gestión de contenedores Docker

<h2 id="tech-stack">🛠️ Stack Tecnológico</h2>

| Tecnología | Propósito |
|------------|-----------|
| **NestJS** | Framework backend modular y escalable |
| **TypeScript** | Tipado estático y desarrollo robusto |
| **Prisma ORM** | Gestión de base de datos type-safe |
| **PostgreSQL** | Base de datos relacional |
| **node-telegram-bot-api** | Integración con Telegram |
| **SSH2** | Conexiones SSH para operaciones remotas |
| **Cheerio** | Web scraping para obtener información de Pico y Placa |
| **Docker** | Containerización y despliegue |

<h2 id="installation">📦 Instalación</h2>

### Requisitos Previos

- Node.js >= 20.18.1
- Yarn o npm
- PostgreSQL (o usar Docker)
- Token de Bot de Telegram

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/ArnedoAn/bot_tg_graphql.git
cd bot_tg_graphql
```

### Paso 2: Instalar Dependencias

```bash
yarn install
```

### Paso 3: Configurar Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```env
# Database
DATABASE_URL="postgresql://botuser:botpassword@localhost:5432/bot_tg_db"

# Telegram Bot
TELEGRAM_BOT_TOKEN=tu_token_de_telegram

# SSH Configuration (opcional)
SSH_HOST=tu_host
SSH_PORT=22
SSH_USERNAME=tu_usuario
SSH_PASSWORD=tu_password
```

### Paso 4: Inicializar Prisma

```bash
yarn db:init
npx prisma migrate dev
```

<h2 id="usage">🚀 Uso</h2>

### Desarrollo

```bash
# Modo watch
yarn start:dev

# Modo debug
yarn start:debug
```

### Producción

```bash
# Build
yarn build

# Ejecutar
yarn start:prod
```

### Testing

```bash
# Tests unitarios
yarn test

# Tests e2e
yarn test:e2e

# Cobertura
yarn test:cov
```

<h2 id="commands">💬 Comandos del Bot</h2>

### Comandos Generales
| Comando | Descripción |
|---------|-------------|
| `/start` | Inicia el bot y muestra mensaje de bienvenida |

### Transcaribe
| Comando | Descripción |
|---------|-------------|
| `/init` | Registra tu tarjeta Transcaribe |
| `/saldo` | Consulta el saldo actual |
| `/historial` | Muestra el historial de transacciones |
| `/info` | Información de la tarjeta |

### Pico y Placa
| Comando | Descripción |
|---------|-------------|
| `/pico` | Consulta el Pico y Placa del día |
| `/addCar` | Agrega un vehículo |
| `/allCars` | Lista todos tus vehículos |
| `/noti` | Prueba de notificaciones |

### DevOps
| Comando | Descripción |
|---------|-------------|
| `/dnsupdate` | Actualiza el DNS remotamente |
| `/testconnection` | Verifica la conexión SSH |

<h2 id="docker">🐳 Docker</h2>

### Opción 1: Docker Compose (Recomendado)

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

### Opción 2: Docker Manual

```bash
# Build
docker build -t bot-telegram .

# Run
docker run -d --name bot-telegram \
  -e DATABASE_URL="tu_database_url" \
  -e TELEGRAM_BOT_TOKEN="tu_token" \
  bot-telegram
```

## 📁 Estructura del Proyecto

```
src/
├── app.module.ts           # Módulo principal
├── main.ts                 # Punto de entrada
├── devops/                 # Módulo DevOps (SSH, DNS)
│   ├── devops.service.ts
│   └── handlers/
├── picoyplaca/             # Módulo Pico y Placa
│   ├── picoyplaca.service.ts
│   └── handlers/
├── reminders/              # Módulo de Recordatorios
│   └── reminders.service.ts
├── shared/                 # Servicios compartidos
│   ├── instances/
│   └── prisma/
├── telegram/               # Módulo Telegram (listeners)
│   └── telegram.service.ts
└── transcaribe/            # Módulo Transcaribe
    ├── transcaribe.service.ts
    └── handlers/
```

## 🔐 Seguridad

- Las credenciales sensibles se gestionan mediante variables de entorno
- Soporte para autenticación SSH con clave privada
- Conexiones seguras a la base de datos

## 📝 Licencia

UNLICENSED - Proyecto personal

## 👨‍💻 Autor

**Andrés Arnedo**

- GitHub: [@ArnedoAn](https://github.com/ArnedoAn)

---

<p align="center">
  Hecho con ❤️ usando NestJS
</p>
