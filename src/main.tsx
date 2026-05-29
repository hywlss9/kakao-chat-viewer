import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { UploadPage } from "./ui/UploadPage";
import { ViewerPage } from "./ui/ViewerPage";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer/:sessionId" element={<ViewerPage />} />
          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  </StrictMode>
);
