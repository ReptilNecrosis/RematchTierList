"use client";

import { useState } from "react";

export function LinkedAccordionPair({
  leftTitle,
  leftIcon,
  leftHeaderExtra,
  leftChildren,
  rightTitle,
  rightIcon,
  rightHeaderExtra,
  rightChildren,
}: {
  leftTitle: string;
  leftIcon?: string;
  leftHeaderExtra?: React.ReactNode;
  leftChildren: React.ReactNode;
  rightTitle: string;
  rightIcon?: string;
  rightHeaderExtra?: React.ReactNode;
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
          {leftHeaderExtra ? <div className="accordion-extra">{leftHeaderExtra}</div> : null}
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
          {rightHeaderExtra ? <div className="accordion-extra">{rightHeaderExtra}</div> : null}
        </div>
        {open && <div className="accordion-body">{rightChildren}</div>}
      </section>
    </div>
  );
}
