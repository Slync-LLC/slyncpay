"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, ExternalLink, X } from "lucide-react";
import { getContractorOnboardingLink } from "../../actions";

export function OnboardingLinkButton({
  contractorId,
  contractorEmail,
  disabled,
}: {
  contractorId: string;
  contractorEmail: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string; environment: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function fetchLink() {
    setErr(null);
    setOpen(true);
    start(async () => {
      const res = await getContractorOnboardingLink(contractorId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setLink({ url: res.url, expiresAt: res.expiresAt, environment: res.environment });
    });
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function close() {
    setOpen(false);
    setLink(null);
    setErr(null);
  }

  const mailto = link
    ? `mailto:${contractorEmail}?subject=${encodeURIComponent("Finish setting up your contractor account")}&body=${encodeURIComponent(`Hi,\n\nPlease finish onboarding by visiting the link below. It expires in 60 minutes — let me know if you need a fresh one.\n\n${link.url}\n\nThanks!`)}`
    : "#";

  return (
    <>
      <button
        type="button"
        onClick={fetchLink}
        disabled={disabled || pending}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
      >
        <Link2 className="h-3 w-3" />
        Onboarding link
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl border border-border max-w-2xl w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Onboarding link</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  For {contractorEmail}. Expires in 60 minutes.
                  {link && (
                    <span className={`ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] ${link.environment === "test" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                      {link.environment}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pending && (
              <div className="text-sm text-muted-foreground">Generating link…</div>
            )}

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {err}
              </div>
            )}

            {link && (
              <>
                <div className="bg-muted rounded-md px-3 py-2 font-mono text-xs break-all">
                  {link.url}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-muted"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <a
                    href={mailto}
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-muted"
                  >
                    Email contractor
                  </a>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium border border-border rounded-md px-3 py-1.5 hover:bg-muted"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
