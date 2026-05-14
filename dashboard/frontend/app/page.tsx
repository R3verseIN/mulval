"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { FileText, Terminal as TerminalIcon, Download, Share2, GripVertical, GripHorizontal } from 'lucide-react';
import GraphViewer from '@/components/GraphViewer';
import { Panel, Group, Separator } from "react-resizable-panels";

const ResizeHandle = ({ className = "", id }: { className?: string; id?: string }) => {
  return (
    <Separator
      className={`relative flex w-1 items-center justify-center bg-white/5 hover:bg-blue-500/50 active:bg-blue-600 transition-colors group data-[separator-state=drag]:bg-blue-600 ${className}`}
      id={id}
    >
      <div className="z-10 flex h-6 w-3 flex-col items-center justify-center rounded-sm text-white/30 group-hover:text-white group-active:text-white transition-colors">
        <GripVertical size={12} />
      </div>
    </Separator>
  );
};

const VerticalResizeHandle = ({ className = "", id }: { className?: string; id?: string }) => {
  return (
    <Separator
      className={`relative flex h-1 items-center justify-center bg-white/5 hover:bg-blue-500/50 active:bg-blue-600 transition-colors group data-[separator-state=drag]:bg-blue-600 ${className}`}
      id={id}
    >
      <div className="z-10 flex w-6 h-3 flex-row items-center justify-center rounded-sm text-white/30 group-hover:text-white group-active:text-white transition-colors">
        <GripHorizontal size={12} />
      </div>
    </Separator>
  );
};

export default function Home() {
  const [code, setCode] = useState<string>(`attackerLocated(internet).
attackGoal(execCode(workStation,_)).

hacl(internet, webServer, tcp, 80).
hacl(webServer, _,  _, _).
hacl(fileServer, _, _, _).
hacl(workStation, _, _, _).
hacl(H,H,_,_).

/* configuration information of fileServer */
networkServiceInfo(fileServer, mountd, rpc, 100005, root).
nfsExportInfo(fileServer, '/export', _anyAccess, workStation).
nfsExportInfo(fileServer, '/export', _anyAccess, webServer).
vulExists(fileServer, vulID, mountd).
vulProperty(vulID, remoteExploit, privEscalation).
localFileProtection(fileServer, root, _, _).

/* configuration information of webServer */
vulExists(webServer, 'CAN-2002-0392', httpd).
vulProperty('CAN-2002-0392', remoteExploit, privEscalation).
networkServiceInfo(webServer , httpd, tcp , 80 , apache).

/* configuration information of workStation */
nfsMounted(workStation, '/usr/local/share', fileServer, '/export', read).`);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const runAnalysis = useCallback(async (codeToRun: string) => {
    setLogs([]);
    setStatus('running');
    setPdfUrl(null);
    setSvgUrl(null);
    
    let hasError = false;

    try {
      // 1. Save the code
      const saveRes = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeToRun, filename: 'input.P' }),
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
            
            if (content.includes('FINISHED with exit code 0')) {
              setStatus('success');
            } else if (content.includes('FINISHED with exit code')) {
              setStatus('error');
              hasError = true;
            }
          }
        });
      }

      // 3. Load PDF & SVG if success
      if (!hasError) {
        const timestamp = Date.now();
        setPdfUrl(`/api/pdf?t=${timestamp}`);
        setSvgUrl(`/api/svg?t=${timestamp}`);
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setLogs(prev => [...prev, '❌ Failed to connect to server']);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      runAnalysis(code);
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [code, runAnalysis]);

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a0a] text-[#ededed] overflow-hidden selection:bg-blue-500/30">
      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        <Group orientation="horizontal">
          {/* Editor Section */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col shadow-2xl relative z-0">
              <div className="h-10 flex items-center px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] gap-2 shadow-sm">
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
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  }
                }}
              />
            </div>
          </Panel>

          <ResizeHandle />

          {/* Output Section */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col bg-black/40 backdrop-blur-sm">
              <Group orientation="vertical">
                {/* Graph Preview */}
                <Panel defaultSize={65} minSize={20}>
                  <div className="h-full relative bg-white/[0.02] flex flex-col">
                    <div className="h-10 flex items-center justify-between px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] shadow-sm">
                      <span className="flex items-center gap-2"><Share2 size={12} /> Interactive Attack Graph</span>
                      {pdfUrl && (
                        <a href={pdfUrl} target="_blank" className="hover:text-white transition-colors flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2 py-1 rounded">
                          <Download size={12} /> Export PDF
                        </a>
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
                      {svgUrl ? (
                        <GraphViewer svgUrl={svgUrl} />
                      ) : (
                        <div className="text-white/10 flex flex-col items-center gap-4 transition-all duration-500 ease-in-out">
                          <FileText size={64} strokeWidth={1} className="drop-shadow-lg" />
                          <p className="text-xs font-medium tracking-wide">Run analysis to generate attack graph</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>

                <VerticalResizeHandle />

                {/* Console */}
                <Panel defaultSize={35} minSize={10}>
                  <div className="h-full flex flex-col overflow-hidden bg-black/60 shadow-inner">
                    <div className="h-10 flex items-center px-4 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] gap-2 shadow-sm">
                      <TerminalIcon size={12} /> Console Output
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 font-mono text-[13px] leading-relaxed selection:bg-white/20 custom-scrollbar">
                      {logs.length === 0 && (
                        <div className="text-white/10 italic animate-pulse">Waiting for analysis to start...</div>
                      )}
                      {logs.map((log, i) => {
                        const isError = log.includes('ERROR') || 
                                       log.includes('exit code') && !log.includes('exit code 0') || 
                                       log.includes('++Error') || 
                                       log.includes('Syntax Error') || 
                                       log.includes('error_handler');
                        const isSuccess = log.includes('SUCCESS') || log.includes('FINISHED with exit code 0');
                        const isSystem = log.startsWith('---') || log.includes('loaded') || log.startsWith('XSB Version');

                        return (
                          <div key={i} className={`mb-1 transition-colors ${
                            isError ? 'text-red-400 font-bold bg-red-400/5 px-2 rounded border-l-2 border-red-500' : 
                            isSuccess ? 'text-green-400 font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]' : 
                            isSystem ? 'text-blue-400/80 italic text-[12px]' :
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
                </Panel>
              </Group>
            </div>
          </Panel>
        </Group>
      </main>
    </div>
  );
}
