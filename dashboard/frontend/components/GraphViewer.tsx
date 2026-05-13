"use client";

import React, { useState, useEffect } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, MousePointer2, Hand, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GraphViewerProps {
  svgUrl: string;
}

export default function GraphViewer({ svgUrl }: GraphViewerProps) {
  const [loading, setLoading] = useState(true);
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSvg() {
      setLoading(true);
      try {
        const response = await fetch(svgUrl);
        let text = await response.text();
        
        // Basic cleanup: Remove XML declaration and DOCTYPE
        text = text.replace(/<\?xml.*\?>/g, '');
        text = text.replace(/<!DOCTYPE.*>/g, '');
        
        // Crucial: Remove the white background polygon that Graphviz adds
        // This is what makes it look like a black box when inverted
        text = text.replace(/<polygon fill="white" stroke="transparent" points="[^"]*"\/>/g, '');
        text = text.replace(/fill="white"/g, 'fill="none"');

        setSvgContent(text);
      } catch (error) {
        console.error("Failed to fetch SVG:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchSvg();
  }, [svgUrl]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/20">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs font-medium tracking-widest uppercase animate-pulse">Processing Graph...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative group bg-black/40 rounded-xl overflow-hidden border border-white/10">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit={true}
      >
        {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
          <>
            {/* Custom Controls Toolbar */}
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex flex-col bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg p-1 shadow-2xl">
                <ControlButton icon={<ZoomIn size={16} />} onClick={() => zoomIn()} tooltip="Zoom In" />
                <ControlButton icon={<ZoomOut size={16} />} onClick={() => zoomOut()} tooltip="Zoom Out" />
                <ControlButton icon={<RotateCcw size={16} />} onClick={() => resetTransform()} tooltip="Reset View" />
              </div>
            </div>

            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyItems: "center" }}
            >
              <AnimatePresence mode="wait">
                <motion.div 
                  key={svgUrl}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full flex items-center justify-center p-8"
                >
                  <style jsx global>{`
                    .svg-content-container svg {
                      width: 100%;
                      height: 100%;
                      max-width: none;
                      filter: invert(0.9) brightness(1.8) contrast(1.1);
                    }
                    /* Ensure all text and paths inherit the inversion */
                    .svg-content-container svg text { fill: #000 !important; }
                    .svg-content-container svg path, 
                    .svg-content-container svg polygon, 
                    .svg-content-container svg ellipse { 
                      stroke: #000 !important; 
                    }
                  `}</style>
                  <div 
                    className="svg-content-container w-full h-full flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: svgContent || '' }} 
                  />
                </motion.div>
              </AnimatePresence>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function ControlButton({ icon, active, onClick, tooltip }: { icon: React.ReactNode, active?: boolean, onClick: () => void, tooltip: string }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`p-2 rounded-md transition-all duration-200 flex items-center justify-center ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40' : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      {icon}
    </button>
  );
}
