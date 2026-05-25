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

---

## Phase 2 — Real-Time Streaming

### Architecture
To provide a fast, responsive interface for AI agents and users, SRAI replaces polling with active real-time WebSocket streaming.
1. **Client Connection**: When an execution is initiated, the web client opens a WebSocket connection to `ws://localhost:3001/stream?jobId=JOB_ID`.
2. **Worker Streaming**: The BullMQ worker running in a separate process starts the Docker container and demultiplexes its stdout/stderr streams.
3. **Redis Pub/Sub**: As chunks are generated, the worker publishes them to a Redis channel dedicated to the job (`execution:{jobId}`).
4. **Broadcast**: The API server receives the pub/sub events and immediately forwards them to all connected WebSockets for that job.

---

## Phase 3 — Persistent Sessions

### Architecture
Persistent sessions allow subsequent execution jobs to access the same directory state (e.g., writing a file in run 1 and reading/modifying it in run 2).
1. **Docker Volumes**: Creating a session creates a named Docker volume (`srai-session-CUID`).
2. **Read-Write Mounts**: During execution, if a `sessionId` is provided, the API server retrieves the volume and the worker mounts it to the container at `/session` as `rw` (read-write), while `/sandbox` (containing the user code) remains `ro` (read-only) for safety.
3. **File Explorer**: Files within a session's volume can be inspected using the file explorer API (`GET /session/:id/files`), which spins up an ephemeral helper container to safely list files and return their metadata.
4. **Cleanup Cron**: A background cron job runs every hour, detecting expired sessions in the database and purging their corresponding Docker volumes automatically.

---

## FAQ: Architecture & Implementation Decisions

### 1. Why use Redis Pub/Sub for real-time log streaming instead of direct WebSockets from the worker?
Because the API server and the BullMQ worker run as separate processes (and potentially separate machines in production). The API server maintains the WebSocket connection with the client, but only the worker is directly attached to the container's output streams. Redis Pub/Sub serves as a high-performance, lightweight message broker that bridges the gap between these isolated processes.

### 2. Why use named Docker Volumes for persistent sessions instead of host directory bindings?
Docker Volumes provide a platform-independent abstraction managed entirely by the Docker daemon. If we used host-bound folders, we would have to manage platform-specific paths (e.g., Windows vs Linux paths), handle complex file permission mappings, and risk exposing host file structures. Docker Volumes are secure, isolated, easy to clean up programmatically via Dockerode, and perform highly under heavy disk I/O.

### 3. Why enforce UID/GID 2000 for the `sandbox` user in both Node and Python Dockerfiles?
By default, official images like `node:alpine` and `python:slim` assign different UID/GID numbers to their respective non-root users. When a single Docker Volume is mounted to containers of different languages, files written by one container may be inaccessible (Permission Denied) to another due to differing owner IDs. Standardizing the `sandbox` user to UID/GID `2000:2000` across all runtime Dockerfiles solves this permission mismatch natively.

### 4. Why spin up an ephemeral container to list files in a session's volume instead of reading the volume directly from the host filesystem?
Docker volumes are stored in internal directories managed by the Docker daemon (e.g., `/var/lib/docker/volumes` on Linux), which are inaccessible or extremely complex to locate on Windows (WSL2 VM) and macOS (Hyperkit/Virtualization framework). Running a short-lived, lightweight container (like Alpine) bound to the volume and running `find /data -type f` provides a reliable, secure, and cross-platform way to extract file lists.

### 5. Why run the Python runner with the `-u` (unbuffered) flag?
By default, Python buffers stdout when writing to non-interactive streams (like Docker's stdout pipe). This causes all `print` output to be held in memory and printed only when the buffer fills or the script ends. However, subprocess commands (like `os.system`) are executed immediately. This mismatch results in out-of-order logs (e.g. system commands executing before previous `print` outputs are flushed). Running Python with the `-u` flag disables output buffering, guaranteeing chronological log ordering in the live terminal feed.

