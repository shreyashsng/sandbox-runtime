"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Trash2, Play, ChevronDown, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface SessionFile {
  path: string;
  size: number;
  modifiedAt: number;
}

interface Session {
  id: string;
  name: string | null;
  volumeName: string;
  language: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<Record<string, SessionFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionLang, setNewSessionLang] = useState<"nodejs" | "python">("nodejs");
  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session`, {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to fetch sessions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
        body: JSON.stringify({
          name: newSessionName || undefined,
          language: newSessionLang,
        }),
      });
      
      if (res.ok) {
        setShowModal(false);
        setNewSessionName("");
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to create session", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Are you sure you want to delete this session? All files will be lost.")) return;
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
        },
      });
      
      if (res.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedSession === id) {
      setExpandedSession(null);
      return;
    }
    
    setExpandedSession(id);
    
    if (!sessionFiles[id]) {
      setLoadingFiles(prev => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/session/${id}/files`, {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_DEV_API_KEY}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setSessionFiles(prev => ({ ...prev, [id]: data.files }));
        }
      } catch (err) {
        console.error("Failed to fetch files", err);
      } finally {
        setLoadingFiles(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)] overflow-hidden">
      {/* Top Nav */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <h1 className="font-mono font-bold text-[var(--color-accent)]">SRAI Sandbox</h1>
        <div className="flex gap-4">
          <Link href="/" className="font-mono text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
            Editor
          </Link>
          <Link href="/sessions" className="font-mono text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)]">
            Sessions
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-mono text-[var(--color-text-primary)]">Persistent Sessions</h2>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-inverse)] px-4 py-2 rounded-md font-mono text-sm transition-colors"
            >
              <Plus size={16} />
              New Session
            </button>
          </div>

          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg overflow-hidden">
            <table className="w-full text-left font-mono text-sm">
              <thead className="bg-[#11111a] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="px-6 py-4 font-medium text-[var(--color-text-secondary)]">Name</th>
                  <th className="px-6 py-4 font-medium text-[var(--color-text-secondary)]">Language</th>
                  <th className="px-6 py-4 font-medium text-[var(--color-text-secondary)]">Last Used</th>
                  <th className="px-6 py-4 font-medium text-[var(--color-text-secondary)]">Expires</th>
                  <th className="px-6 py-4 font-medium text-[var(--color-text-secondary)] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--color-text-secondary)]">Loading sessions...</td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--color-text-secondary)]">No active sessions found.</td>
                  </tr>
                ) : sessions.map(session => {
                  const isExpanded = expandedSession === session.id;
                  const isNode = session.language === "nodejs";
                  
                  return (
                    <React.Fragment key={session.id}>
                      <tr className="hover:bg-[#11111a] transition-colors group">
                        <td className="px-6 py-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(session.id)}>
                          <span className="text-[var(--color-text-secondary)]">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                          <span className="font-semibold text-[var(--color-text-primary)]">{session.name || session.id.slice(-8)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs ${isNode ? "bg-[#22c55e1a] text-[var(--color-lang-node)]" : "bg-[#38bdf81a] text-[var(--color-lang-python)]"}`}>
                            {session.language}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-secondary)]">
                          {new Date(session.lastUsedAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-[var(--color-text-secondary)]">
                          {new Date(session.expiresAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => router.push(`/?sessionId=${session.id}`)}
                              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] rounded-md transition-colors"
                              title="Execute code in this session"
                            >
                              <Play size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="p-1.5 text-[#ef4444] hover:bg-[#ef44441a] rounded-md transition-colors"
                              title="Delete session"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr className="bg-[#0c0c14]">
                          <td colSpan={5} className="px-6 py-4 border-t border-[#11111a]">
                            <div className="pl-6 border-l-2 border-[#11111a]">
                              <h4 className="text-xs font-semibold uppercase text-[var(--color-text-secondary)] mb-2">File Explorer</h4>
                              {loadingFiles[session.id] ? (
                                <p className="text-sm text-[var(--color-text-secondary)]">Loading files...</p>
                              ) : !sessionFiles[session.id] || sessionFiles[session.id].length === 0 ? (
                                <p className="text-sm text-[var(--color-text-secondary)]">No files found in this session.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {sessionFiles[session.id].map((file, i) => (
                                    <li key={i} className="flex justify-between items-center text-sm px-2 py-1 hover:bg-[#11111a] rounded">
                                      <span className="text-[var(--color-text-primary)]">{file.path}</span>
                                      <span className="text-xs text-[var(--color-text-secondary)]">{(file.size / 1024).toFixed(2)} KB</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Session Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-mono font-bold mb-4">Create New Session</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-mono text-[var(--color-text-secondary)] mb-1">Session Name (optional)</label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  placeholder="my-cool-session"
                />
              </div>
              
              <div>
                <label className="block text-sm font-mono text-[var(--color-text-secondary)] mb-1">Language</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewSessionLang("nodejs")}
                    className={`flex-1 px-3 py-2 rounded-md font-mono text-sm transition-colors ${
                      newSessionLang === "nodejs" 
                        ? "bg-[var(--color-accent-dim)] text-[var(--color-lang-node)] border border-[var(--color-accent-glow)]" 
                        : "bg-transparent border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]"
                    }`}
                  >
                    nodejs
                  </button>
                  <button
                    onClick={() => setNewSessionLang("python")}
                    className={`flex-1 px-3 py-2 rounded-md font-mono text-sm transition-colors ${
                      newSessionLang === "python" 
                        ? "bg-[var(--color-accent-dim)] text-[var(--color-lang-python)] border border-[var(--color-accent-glow)]" 
                        : "bg-transparent border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-overlay)]"
                    }`}
                  >
                    python
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-md font-mono text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={isCreating}
                className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-inverse)] px-4 py-2 rounded-md font-mono text-sm transition-colors disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
