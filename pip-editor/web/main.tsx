/** Browser adapter: mounts the generic editor host into the static document shell. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { RelationHost } from "../relation-host/relation-host";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Editor document requires a #root mount point");

createRoot(root).render(
  <StrictMode>
    <RelationHost />
  </StrictMode>,
);
