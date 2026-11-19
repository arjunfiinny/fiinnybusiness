"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";

export function CatalogShareButton({ className = "", label = "Share catalog", copiedLabel = "Link copied" }: { className?: string; label?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/catalog`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "KrishiDukan catalog",
          text: "Explore KrishiDukan for farmers, agri shops and brands.",
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copy the catalog link", url);
    }
  };

  return (
    <button type="button" onClick={() => void share()} className={className}>
      <Share2 aria-hidden="true" className="h-4 w-4" />
      {copied ? copiedLabel : label}
    </button>
  );
}

export function CatalogPrintButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Download aria-hidden="true" className="h-4 w-4" />
      Print / save PDF
    </button>
  );
}
