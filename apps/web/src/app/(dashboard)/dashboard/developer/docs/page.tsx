import { DocsClient } from "./docs-client";

export default function ApiDocsPage() {
  return (
    <div className="h-full">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-bold">API Reference</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Try requests against your account directly from the browser. Paste a key from{" "}
          <a href="/dashboard/developer/keys" className="text-primary hover:underline">
            Developer → API Keys
          </a>{" "}
          into the auth field to enable &quot;Try it&quot;.
        </p>
      </div>
      <DocsClient />
    </div>
  );
}
