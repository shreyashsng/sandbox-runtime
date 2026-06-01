"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import Editor from "@monaco-editor/react";
import { Play, Square } from "lucide-react";
import { TerminalComponent, TerminalRef } from "../components/terminal/Terminal";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function SandboxEditor() {
  const [language, setLanguage] = useState<"nodejs" | "python">("nodejs");
  const [code, setCode] = useState<string>("console.log('hello from sandbox');");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [duration, setDuration] = useState<number | null>(null);

  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const terminalRef = useRef<TerminalRef>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleRun = async () => {
    if (!code) return;
    setStatus("queued");
    setDuration(null);
    terminalRef.current?.clear();
    terminalRef.current?.write("[system] sending execution request...\r\n", "system");

    // Automatically detect packages from code to showcase Phase 4 in the demo!
    const packages: string[] = [];
    if (language === "python") {
      const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_\-\.]+)/gm;
      let match;
      const seen = new Set<string>();
      const stdlib = new Set([
        "os", "sys", "time", "json", "math", "urllib", "random", "datetime", 
        "subprocess", "hashlib", "re", "collections", "itertools", "functools", 
        "pathlib", "shutil", "tempfile", "io", "csv", "ast", "asyncio", "threading", 
        "queue", "socket", "select", "ssl", "logging", "argparse", "uuid", "base64", 
        "typing", "warnings", "traceback", "inspect", "platform", "gc", "weakref", 
        "copy", "bisect", "array", "contextlib", "sqlite3"
      ]);
      while ((match = importRegex.exec(code)) !== null) {
        const pkg = match[1].split(".")[0];
        if (!stdlib.has(pkg) && !seen.has(pkg)) {
          seen.add(pkg);
          packages.push(pkg);
        }
      }
    } else if (language === "nodejs") {
      const requireRegex = /require\(['"]([a-zA-Z0-9\-_.@/]+)['"]\)/g;
      const importRegex = /from\s+['"]([a-zA-Z0-9\-_.@/]+)['"]/g;
      const seen = new Set<string>();
      let match;
      while ((match = requireRegex.exec(code)) !== null) {
        const pkg = match[1].startsWith(".") ? null : match[1].split("/")[0];
        if (pkg && !seen.has(pkg)) {
          seen.add(pkg);
          packages.push(pkg);
        }
      }
      while ((match = importRegex.exec(code)) !== null) {
        const pkg = match[1].startsWith(".") ? null : match[1].split("/")[0];
        if (pkg && !seen.has(pkg)) {
          seen.add(pkg);
          packages.push(pkg);
        }
      }
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
        body: JSON.stringify({ 
          language, 
          code, 
          sessionId: sessionId || undefined,
          packages: packages.length > 0 ? packages : undefined
        }),
      });

      if (!res.ok) {
        let errorMessage = "Execution request failed";
        try {
          const errData = await res.json();
          if (errData.error) {
            errorMessage = errData.error;
          }
        } catch (e) {
          // fallback to generic message
        }
        throw new Error(errorMessage);
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
    <div className="flex flex-col h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)] overflow-hidden">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <h1 className="font-mono font-bold text-[var(--color-accent)]">SRAI Sandbox</h1>
        <div className="flex gap-4">
          <Link href="/" className="font-mono text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">
            Editor
          </Link>
          <Link href="/sessions" className="font-mono text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
            Sessions
          </Link>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col md:flex-row flex-1 p-6 gap-6 overflow-hidden">
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
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)] flex items-center justify-center font-mono">Loading...</div>}>
      <SandboxEditor />
    </Suspense>
  );
}
