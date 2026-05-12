"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export function DocsClient() {
  return (
    <ApiReferenceReact
      configuration={{
        spec: { url: "/openapi.json" },
        layout: "modern",
        hideDarkModeToggle: false,
        hideClientButton: false,
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      }}
    />
  );
}
