"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface TerminalRef {
  write: (text: string, type: "stdout" | "stderr" | "system") => void;
  clear: () => void;
}

interface TerminalProps {
  className?: string;
}

export const TerminalComponent = forwardRef<TerminalRef, TerminalProps>(({ className }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useImperativeHandle(ref, () => ({
    write: (text: string, type: "stdout" | "stderr" | "system") => {
      if (!xtermRef.current) return;
      
      // Convert newlines to CRLF for xterm
      const normalizedText = text.replace(/\r?\n/g, "\r\n");

      const term = xtermRef.current;
      if (type === "stdout") {
        term.write(`\x1b[38;2;212;212;216m${normalizedText}\x1b[0m`); // --terminal-text: #d4d4d8
      } else if (type === "stderr") {
        term.write(`\x1b[38;2;239;68;68m${normalizedText}\x1b[0m`);   // --terminal-red: #ef4444
      } else if (type === "system") {
        term.write(`\x1b[38;2;82;82;91m${normalizedText}\x1b[0m`);    // --terminal-dim: #52525b
      }
    },
    clear: () => {
      xtermRef.current?.clear();
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#07070d",
        foreground: "#d4d4d8",
        cursor: "#6c63ff",
        selectionBackground: "rgba(108, 99, 255, 0.25)",
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.7,
      cursorBlink: true,
      disableStdin: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    
    // Fit needs a tiny delay to ensure DOM is fully ready
    setTimeout(() => {
      fitAddon.fit();
    }, 10);

    xtermRef.current = term;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // ignore resize errors during unmount
      }
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div 
      ref={terminalRef} 
      className={`h-full w-full rounded-md border border-[#1e1e2e] bg-[#07070d] p-4 overflow-hidden ${className || ""}`}
    />
  );
});

TerminalComponent.displayName = "TerminalComponent";
