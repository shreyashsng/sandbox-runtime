# SRAI — Sandbox Runtime for AI Agents

Run untrusted code. Trust the runtime.

## Phase 1 — Setup

### Prerequisites
- Node.js 20+
- Docker Desktop running
- pnpm installed globally

### Steps
1. Clone repo
2. `pnpm install` (from root — installs backend deps)
3. `cd web && pnpm install` (installs frontend deps)
4. `cp .env.example .env` → fill in values
5. `pnpm docker:up` → starts Postgres + Redis
6. `pnpm docker:images` → builds srai-node and srai-python sandbox images
7. `pnpm db:migrate` → runs DB migration
8. `pnpm db:seed` → prints your dev API key, paste into .env

### Running
Terminal 1: `pnpm dev`          (API server on :3001)
Terminal 2: `pnpm dev:worker`   (BullMQ worker)
Terminal 3: `cd web && pnpm dev` (Next.js on :3000)

### Test with curl
```bash
curl -X POST http://localhost:3001/execute \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(\"hello from sandbox\")"}'
```
→ returns `{ jobId }`

```bash
curl http://localhost:3001/job/JOB_ID \
  -H "Authorization: Bearer YOUR_KEY"
```
→ returns `{ status: "success", stdout: "hello from sandbox\n", ... }`
