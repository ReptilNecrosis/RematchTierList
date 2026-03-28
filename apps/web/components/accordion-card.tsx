"use client";

import { useEffect, useState } from "react";

export function AccordionCard({
  title,
  icon,
  defaultOpen = false,
  className = "",
  headerExtra,
  openOnHash,
  children,
}: {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  className?: string;
  headerExtra?: React.ReactNode;
  openOnHash?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (openOnHash && window.location.hash === `#${openOnHash}`) {
      setOpen(true);
    }
  }, [openOnHash]);

  return (
    <section className={`dash-card ${className}`}>
      <div className={`accordion-header-row${open ? " open" : ""}`}>
        <button className="accordion-trigger" onClick={() => setOpen((o) => !o)}>
          <div className="dash-card-title">
            {icon && <span>{icon}</span>} {title}
          </div>
          <span className={`accordion-chevron${open ? " open" : ""}`}>›</span>
        </button>
        {headerExtra && <div className="accordion-extra">{headerExtra}</div>}
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </section>
  );
}
