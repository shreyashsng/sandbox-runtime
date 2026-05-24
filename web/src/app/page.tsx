"use client";

import React, { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Play, Square } from "lucide-react";
import { TerminalComponent, TerminalRef } from "../components/terminal/Terminal";

export default function Home() {
  const [language, setLanguage] = useState<"nodejs" | "python">("nodejs");
  const [code, setCode] = useState<string>("console.log('hello from sandbox');");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [duration, setDuration] = useState<number | null>(null);

  const terminalRef = useRef<TerminalRef>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleRun = async () => {
    if (!code) return;
    setStatus("queued");
    setDuration(null);
    terminalRef.current?.clear();
    terminalRef.current?.write("[system] sending execution request...\r\n", "system");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
        body: JSON.stringify({ language, code }),
      });

      if (!res.ok) {
        throw new Error("Execution request failed");
      }

      const data = await res.json();
      setJobId(data.jobId);
    } catch (err: any) {
      terminalRef.current?.write(err.message + "\r\n", "stderr");
      setStatus("failed");
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/job/${jobId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
      });
    } catch (err: any) {
      console.error("Cancel failed", err);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    const ws = new WebSocket(`${wsUrl}/stream?jobId=${jobId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "stdout" || message.type === "stderr" || message.type === "system") {
          terminalRef.current?.write(message.chunk, message.type);
          setStatus((prev) => (prev === "queued" ? "running" : prev));
        } else if (message.type === "done") {
          setStatus(message.status);
          if (message.durationMs !== null && message.durationMs !== undefined) {
            setDuration(message.durationMs);
          }
        }
      } catch (e) {
        console.error("Error parsing WS message", e);
      }
    };

    ws.onclose = () => {
      terminalRef.current?.write("\r\n[system] connection closed\r\n", "system");
    };

    ws.onerror = () => {
      terminalRef.current?.write("\r\n[system] connection error\r\n", "system");
    };

    return () => {
      ws.close();
    };
  }, [jobId]);

  const handleLanguageChange = (lang: "nodejs" | "python") => {
    setLanguage(lang);
    if (lang === "nodejs") {
      setCode("console.log('hello from sandbox');");
    } else {
      setCode("print('hello from sandbox')");
    }
  };

  const renderBadge = () => {
    if (status === "idle") return null;

    let badgeClass = "";
    let dotClass = "";
    
    switch (status) {
      case "running":
        badgeClass = "bg-[#38bdf81a] text-[#38bdf8]";
        dotClass = "bg-[#38bdf8] animate-pulse";
        break;
      case "success":
        badgeClass = "bg-[#22c55e1a] text-[#22c55e]";
        dotClass = "bg-[#22c55e]";
        break;
      case "failed":
        badgeClass = "bg-[#ef44441a] text-[#ef4444]";
        dotClass = "bg-[#ef4444]";
        break;
      case "queued":
        badgeClass = "bg-[#f59e0b1a] text-[#f59e0b]";
        dotClass = "bg-[#f59e0b] animate-pulse";
        break;
      case "killed":
        badgeClass = "bg-[#22222f] text-[#4a4a6a]";
        dotClass = "bg-[#4a4a6a]";
        break;
    }

    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full font-mono text-[11px] ${badgeClass}`}>
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        {status}
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-screen p-6 gap-6 bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      {/* Editor Panel */}
      <div className="flex-1 min-w-0 flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => handleLanguageChange("nodejs")}
              className={`px-3 py-1.5 rounded-md font-mono text-sm transition-colors ${
                language === "nodejs" 
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-lang-node)] border border-[var(--color-accent-glow)]" 
                  : "bg-transparent border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]"
              }`}
            >
              nodejs
            </button>
            <button
              onClick={() => handleLanguageChange("python")}
              className={`px-3 py-1.5 rounded-md font-mono text-sm transition-colors ${
                language === "python" 
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-lang-python)] border border-[var(--color-accent-glow)]" 
                  : "bg-transparent border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]"
              }`}
            >
              python
            </button>
          </div>
          {status === "queued" || status === "running" ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 bg-[#ef44441a] hover:bg-[#ef444433] text-[#ef4444] border border-[#ef44444d] px-4 py-2 rounded-md font-mono text-sm transition-colors"
            >
              <Square size={16} />
              cancel
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-inverse)] px-4 py-2 rounded-md font-mono text-sm transition-colors"
            >
              <Play size={16} />
              run
            </button>
          )}
        </div>
        <div className="flex-1 min-h-[500px] border border-[var(--color-border-subtle)] rounded-md overflow-hidden">
          <Editor
            height="100%"
            language={language === "nodejs" ? "javascript" : "python"}
            theme="vs-dark"
            value={code}
            onChange={(val) => setCode(val || "")}
            options={{
              minimap: { enabled: false },
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          />
        </div>
      </div>

      {/* Output Panel */}
      <div className="flex-1 min-w-0 flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-4">
        <div className="flex justify-between items-center mb-4 h-[38px]">
          {renderBadge()}
          {duration !== null && (
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">
              {duration}ms
            </div>
          )}
        </div>
        <div className="flex-1 min-h-[500px] min-w-0 overflow-hidden">
          <TerminalComponent ref={terminalRef} />
        </div>
      </div>
    </div>
  );
}
