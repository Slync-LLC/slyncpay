"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, ExternalLink, X, Mail } from "lucide-react";
import { getWorkerOnboardingLink } from "./actions";

export function OnboardingLinkButton({
  workerId,
  workerEmail,
  disabled,
}: {
  workerId: string;
  workerEmail: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function fetchLink() {
    setErr(null);
    setOpen(true);
    setLink(null);
    start(async () => {
      const res = await getWorkerOnboardingLink(workerId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setLink({ url: res.url, expiresAt: res.expiresAt });
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
    ? `mailto:${workerEmail}?subject=${encodeURIComponent("Finish setting up your worker account")}&body=${encodeURIComponent(`Hi,\n\nPlease finish onboarding by visiting the link below. It expires in 60 minutes — let me know if you need a fresh one.\n\n${link.url}\n\nThanks!`)}`
    : "#";

  return (
    <>
      <button
        type="button"
        onClick={fetchLink}
        disabled={disabled || pending}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
      >
        <Link2 className="h-3 w-3" />
        Onboarding
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
                  For {workerEmail}. Expires in 60 minutes.
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
                    <Mail className="h-3.5 w-3.5" />
                    Email
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
