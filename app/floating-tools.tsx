"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { languageNames, type Language } from "@/lib/languages";
import { whatsappLink, WHATSAPP_DISPLAY_NUMBER } from "@/lib/whatsapp";
import { useLanguage } from "./language-provider";

export default function FloatingTools() {
  const [open, setOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setCode(new URLSearchParams(location.search).get("code") || ""),
      0,
    );
    return () => clearTimeout(timer);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;

    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }

    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const defaultWhatsAppLink = useMemo(
    () =>
      whatsappLink(
        code
          ? `Hello, I need help with shipment ${code}.`
          : "Hello, I need help with my shipment.",
      ),
    [code],
  );

  return (
    <div ref={root} className="floating-tools" translate="no">
      {open && (
        <div
          id="language-options"
          className="language-popover"
          role="group"
          aria-label={t("Language")}
        >
          <div className="language-popover-heading">
            <strong>{t("Language")}</strong>
            <button
              type="button"
              aria-label={t("Close")}
              onClick={() => {
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              ×
            </button>
          </div>
          {(Object.keys(languageNames) as Language[]).map((value) => (
            <button
              key={value}
              type="button"
              lang={value}
              aria-pressed={language === value}
              onClick={() => {
                setLanguage(value);
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              {languageNames[value]}
              {language === value && (
                <i className="fas fa-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}

      <button
        ref={toggle}
        type="button"
        className="floating-language"
        aria-label={t("Change language")}
        aria-expanded={open}
        aria-controls="language-options"
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fas fa-language" aria-hidden="true" />
        <span>{language.toUpperCase()}</span>
      </button>

      <a
        className="floating-whatsapp"
        href={defaultWhatsAppLink}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("Chat on WhatsApp")}
        title={`${t("Chat on WhatsApp")} ${WHATSAPP_DISPLAY_NUMBER}`}
      >
        <i className="fab fa-whatsapp" aria-hidden="true" />
      </a>
    </div>
  );
}
