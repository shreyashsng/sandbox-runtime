"use client";

import React, { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Play } from "lucide-react";

export default function Home() {
  const [language, setLanguage] = useState<"nodejs" | "python">("nodejs");
  const [code, setCode] = useState<string>("console.log('hello from sandbox');");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [output, setOutput] = useState<{ stdout: string; stderr: string }>({ stdout: "", stderr: "" });
  const [duration, setDuration] = useState<number | null>(null);

  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const handleRun = async () => {
    if (!code) return;
    setStatus("queued");
    setOutput({ stdout: "", stderr: "" });
    setDuration(null);

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
      setStatus("queued");
    } catch (err: any) {
      setOutput({ stdout: "", stderr: err.message });
      setStatus("failed");
    }
  };

  useEffect(() => {
    if (!jobId || ["success", "failed", "killed"].includes(status)) {
      if (pollInterval.current) clearInterval(pollInterval.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/job/${jobId}`, {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          setOutput({ stdout: data.stdout || "", stderr: data.stderr || "" });
          if (data.durationMs !== null) {
            setDuration(data.durationMs);
          }
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    };

    pollInterval.current = setInterval(poll, 1500);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [jobId, status]);

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
      <div className="flex-1 flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-4">
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
          <button
            onClick={handleRun}
            disabled={status === "running" || status === "queued"}
            className="flex items-center gap-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-inverse)] px-4 py-2 rounded-md font-mono text-sm disabled:opacity-50 transition-colors"
          >
            <Play size={16} />
            run
          </button>
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
      <div className="flex-1 flex flex-col bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-4">
        <div className="flex justify-between items-center mb-4 h-[38px]">
          {renderBadge()}
          {duration !== null && (
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)]">
              {duration}ms
            </div>
          )}
        </div>
        <div className="flex-1 bg-[var(--color-terminal-bg)] border border-[var(--color-border-subtle)] rounded-md p-4 overflow-auto font-mono text-[13px] leading-[1.7]">
          {output.stdout && (
            <pre className="text-[var(--color-terminal-text)] m-0 break-all whitespace-pre-wrap">
              {output.stdout}
            </pre>
          )}
          {output.stderr && (
            <pre className="text-[var(--color-terminal-red)] m-0 break-all whitespace-pre-wrap">
              {output.stderr}
            </pre>
          )}
          {!output.stdout && !output.stderr && status === "idle" && (
            <div className="text-[var(--color-terminal-dim)]">
              No executions yet. Submit code to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
