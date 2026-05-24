import { WebSocket } from "ws";

const activeStreams = new Map<string, Set<WebSocket>>();

export function registerStream(jobId: string, ws: WebSocket) {
  if (!activeStreams.has(jobId)) {
    activeStreams.set(jobId, new Set());
  }
  activeStreams.get(jobId)!.add(ws);

  ws.on("close", () => {
    const streams = activeStreams.get(jobId);
    if (streams) {
      streams.delete(ws);
      if (streams.size === 0) {
        activeStreams.delete(jobId);
      }
    }
  });
}

export function broadcastToJob(jobId: string, message: any) {
  const streams = activeStreams.get(jobId);
  if (streams) {
    const data = JSON.stringify(message);
    streams.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

export function closeJob(jobId: string) {
  const streams = activeStreams.get(jobId);
  if (streams) {
    streams.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    activeStreams.delete(jobId);
  }
}
