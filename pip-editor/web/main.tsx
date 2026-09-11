/** Browser adapter: mounts the generic editor host into the static document shell. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PipHost } from "../pip-host/pip-host";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Editor document requires a #root mount point");

createRoot(root).render(
  <StrictMode>
    <PipHost />
  </StrictMode>,
);
