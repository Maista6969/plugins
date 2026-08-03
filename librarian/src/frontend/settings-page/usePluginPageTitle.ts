import { useEffect, useState } from "react";
import { useApolloClient } from "@apollo/client";
import { fetchPluginDisplayName } from "../shared/stash-api.js";

export function usePluginPageTitle(): string | null {
  const client = useApolloClient();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPluginDisplayName(client).then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!name) return;
    const previousTitle = document.title;
    document.title = name + " | Stash";
    return () => {
      document.title = previousTitle;
    };
  }, [name]);

  return name;
}
