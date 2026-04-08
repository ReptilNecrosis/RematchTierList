"use client";

import { useState } from "react";

export function RulesetPdfButton({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="nav-tab" onClick={() => setOpen(true)}>
        <span>📜</span> {label}
      </button>
      {open && (
        <div
          className="pdf-modal-overlay"
          onClick={() => setOpen(false)}
        >
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-header">
              <span className="pdf-modal-title">{label}</span>
              <div className="pdf-modal-actions">
                <a href={url} download className="btn-login" style={{ fontSize: "0.8rem", padding: "4px 10px" }}>
                  Download
                </a>
                <button className="pdf-modal-close" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>
            </div>
            <iframe src={url} title={label} />
          </div>
        </div>
      )}
    </>
  );
}
