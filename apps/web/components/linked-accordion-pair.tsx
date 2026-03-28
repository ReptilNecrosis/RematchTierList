"use client";

import { useState } from "react";

export function LinkedAccordionPair({
  leftTitle,
  leftIcon,
  leftChildren,
  rightTitle,
  rightIcon,
  rightChildren,
}: {
  leftTitle: string;
  leftIcon?: string;
  leftChildren: React.ReactNode;
  rightTitle: string;
  rightIcon?: string;
  rightChildren: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <div className="linked-accordion-pair">
      <section className="dash-card">
        <div className={`accordion-header-row${open ? " open" : ""}`}>
          <button className="accordion-trigger" onClick={toggle}>
            <div className="dash-card-title">
              {leftIcon && <span>{leftIcon}</span>} {leftTitle}
            </div>
            <span className={`accordion-chevron${open ? " open" : ""}`}>›</span>
          </button>
        </div>
        {open && <div className="accordion-body">{leftChildren}</div>}
      </section>
      <section className="dash-card">
        <div className={`accordion-header-row${open ? " open" : ""}`}>
          <button className="accordion-trigger" onClick={toggle}>
            <div className="dash-card-title">
              {rightIcon && <span>{rightIcon}</span>} {rightTitle}
            </div>
            <span className={`accordion-chevron${open ? " open" : ""}`}>›</span>
          </button>
        </div>
        {open && <div className="accordion-body">{rightChildren}</div>}
      </section>
    </div>
  );
}
