"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const config: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Ajora is stateless/compute-ephemeral; keep data fresh-ish but
      // avoid refetch storms during the demo.
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
};

/**
 * App-wide TanStack Query provider. A single client is created per browser
 * session (via useState so it survives re-renders but never leaks between
 * requests on the server).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient(config));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
