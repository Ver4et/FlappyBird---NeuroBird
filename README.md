# NeuroBird

NeuroBird is a browser Flappy Bird game with a real-time NEAT neuroevolution simulator. Players can compete with an evolved agent, train a population of birds, collect skins and save their best score in PostgreSQL.

## Features

- Human game mode and human vs. AI mode.
- NEAT population training with configurable population, survivors and mutation probability.
- Evolving network topology: weights, connections and hidden nodes can mutate.
- Registration, login, score persistence and skin inventory.
- Admin statistics and user management.
- Express static server with a database health endpoint at `/health`.

## Architecture

- `index.js` - Express API, static files, authentication and startup/bootstrap.
- `models/mapping.js` - Sequelize models and associations.
- `sequelize.js` - PostgreSQL connection.
- `public/` - production frontend pages, styles and browser scripts.
- `mainmodule/` - source copy of the AI game modules.

The AI simulation runs entirely in the browser. The server stores account data, scores and skin ownership; it does not execute the neural network on the backend.

## Requirements

- Node.js 18 or newer.
- PostgreSQL 13 or newer.
- A database created before the first start.

## Local setup

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:5000`. Check the deployment state with `http://localhost:5000/health`.

The application creates the required tables with Sequelize and seeds roles and skins on startup. Production deployments should use migrations instead of schema changes made during application startup.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port, defaults to `5000`. |
| `DB_NAME` | Yes | PostgreSQL database name. |
| `DB_USER` | Yes | PostgreSQL user. |
| `DB_PASSWORD` | Yes | PostgreSQL password. |
| `DB_HOST` | Yes | PostgreSQL host. |
| `DB_PORT` | No | PostgreSQL port, normally `5432`. |
| `TOKEN_SECRET` | Production | Long random secret used to sign auth tokens. |
| `CORS_ORIGIN` | No | Comma-separated allowed browser origins. |
| `ADMIN_LOGIN` | No | Login for one-time admin bootstrap. |
| `ADMIN_PASSWORD` | No | Password for one-time admin bootstrap. |

Do not deploy the repository `.env` file or use the old sample credentials. Store secrets in the platform secret manager. The bootstrap admin is not created unless both admin variables are explicitly set.

## API overview

- `POST /api/auth/register` - create an account.
- `POST /api/auth/login` - receive a bearer token.
- `GET /api/profile` - read the authenticated profile and owned skins.
- `GET /api/skins` - list skins and unlock state.
- `POST /api/profile/set-skin` - select an owned skin.
- `POST /api/profile/update-score` - persist a new personal best.
- `GET /api/admin/stats` and `GET /api/admin/users` - admin-only operations.
- `GET /health` - database-backed readiness check.

Protected endpoints use `Authorization: Bearer <token>`.

## NEAT model

Each bird owns a small feed-forward network with five inputs: normalized pipe distance, upper gap distance, lower gap distance, bird height and pipe vertical speed. A positive output triggers a flap. At the end of a generation, birds are sorted by fitness, the strongest survivors are retained, and crossover plus mutation creates the next population.

Fitness is based primarily on passed pipes, with lifetime used only as a small tie-breaker. This keeps survival time from overpowering actual game progress.

## Verification and deployment

```bash
npm test
NODE_ENV=production TOKEN_SECRET="replace-with-a-long-random-value" npm start
```

For a container or PaaS deployment, expose `PORT`, run `npm ci --omit=dev` during build, run `npm start`, and configure the health check path as `/health`. Use a managed PostgreSQL instance and a persistent secret manager. There are currently no automated browser or database integration tests; manual verification should cover registration, login, score update, skin selection and AI simulation settings.

