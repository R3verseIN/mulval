"use client";

import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, FileText, Terminal as TerminalIcon, Download } from 'lucide-react';

export default function Home() {
  const [code, setCode] = useState<string>(`/* Sample MulVAL Datalog */
attackerLocated(workStation).
hasAccount(user, workStation).
hacl(workStation, server, tcp, 80).
vulExists(server, 'CVE-2023-1234', httpd).
networkServiceInfo(server, httpd, tcp, 80, user).
`);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const runAnalysis = async () => {
    setLogs([]);
    setStatus('running');
    setPdfUrl(null);

    try {
      // 1. Save the code
      const saveRes = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filename: 'input.P' }),
      });
      if (!saveRes.ok) throw new Error('Failed to save file');

      // 2. Stream the logs
      const response = await fetch('/api/run?filename=input.P');
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const content = line.replace('data: ', '');
            setLogs(prev => [...prev, content]);
            
            if (content.includes('FINISHED with exit code 0')) setStatus('success');
            else if (content.includes('FINISHED with exit code')) setStatus('error');
          }
        });
      }

      // 3. Load PDF if success
      if (status !== 'error') {
        setPdfUrl(`/api/pdf?t=${Date.now()}`);
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setLogs(prev => [...prev, '❌ Failed to connect to server']);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] text-[#ededed] overflow-hidden selection:bg-blue-500/30">
      {/* Header */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/20 uppercase">
            M
          </div>
          <h1 className="font-semibold text-lg tracking-tight">MulVAL Dashboard</h1>
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
            status === 'running' ? 'bg-yellow-500/10 text-yellow-500 animate-pulse border border-yellow-500/20' :
            status === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
            status === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
            'bg-white/5 text-white/40 border border-white/10'
          }`}>
            {status}
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={status === 'running'}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg transition-all active:scale-95 font-semibold text-sm shadow-lg shadow-blue-600/10"
        >
          <Play size={16} fill="currentColor" />
          Run Analysis
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Editor Section */}
        <div className="flex-1 flex flex-col border-r border-white/10 shadow-2xl relative z-0">
          <div className="h-10 flex items-center px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] gap-2">
            <FileText size={12} /> input.P
          </div>
          <Editor
            height="100%"
            defaultLanguage="prolog"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Menlo, monospace',
              padding: { top: 20 },
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              readOnly: status === 'running',
              automaticLayout: true,
            }}
          />
        </div>

        {/* Output Section */}
        <div className="w-[45%] flex flex-col bg-black/40 backdrop-blur-sm">
          <div className="flex-1 flex flex-col min-h-0">
            {/* PDF Preview */}
            <div className="flex-1 border-b border-white/10 relative bg-white/[0.02] flex flex-col">
              <div className="h-10 flex items-center justify-between px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
                <span>Visual Graph Preview</span>
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" className="hover:text-white transition-colors flex items-center gap-1.5">
                    <Download size={12} /> Download PDF
                  </a>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full rounded-xl shadow-2xl border border-white/10 bg-white" />
                ) : (
                  <div className="text-white/10 flex flex-col items-center gap-4">
                    <FileText size={64} strokeWidth={1} />
                    <p className="text-xs font-medium tracking-wide">Run analysis to generate attack graph</p>
                  </div>
                )}
              </div>
            </div>

            {/* Console */}
            <div className="h-[35%] flex flex-col overflow-hidden bg-black/60">
              <div className="h-10 flex items-center px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] gap-2">
                <TerminalIcon size={12} /> Console Output
              </div>
              <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-relaxed selection:bg-white/20">
                {logs.length === 0 && (
                  <div className="text-white/10 italic">Waiting for analysis to start...</div>
                )}
                {logs.map((log, i) => {
                  const isError = log.includes('ERROR') || log.includes('exit code') && !log.includes('exit code 0') || log.includes('++Error');
                  const isSuccess = log.includes('SUCCESS') || log.includes('FINISHED with exit code 0');
                  return (
                    <div key={i} className={`mb-1 transition-colors ${
                      isError ? 'text-red-400 font-bold' : 
                      isSuccess ? 'text-green-400 font-bold' : 
                      log.startsWith('---') ? 'text-blue-400 border-b border-blue-400/20 pb-2 mb-3 mt-1' :
                      'text-white/60 hover:text-white/90'
                    }`}>
                      {log}
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
