import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppNav } from "./components/AppNav";
import { ChatFab } from "./components/ChatFab";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { InboxPage } from "./pages/InboxPage";
import { MemoPage } from "./pages/MemoPage";
import { OverviewPage } from "./pages/OverviewPage";
import { RelationsPage } from "./pages/RelationsPage";
import { SubcategoryPage } from "./pages/SubcategoryPage";
import { TaxonomyPage } from "./pages/TaxonomyPage";
import { TechPage } from "./pages/TechPage";
import { cssVariablesResolver, theme } from "./theme";
import "@mantine/core/styles.css";
import "./theme.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("描画先がありません");
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      <BrowserRouter>
        <div className="app-shell">
          <AppNav />
          <div className="sheet">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/relations" element={<RelationsPage />} />
              <Route path="/imports" element={<ImportPage />} />
              <Route path="/memos" element={<MemoPage />} />
              <Route path="/memos/:id" element={<MemoPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/taxonomy" element={<TaxonomyPage />} />
              <Route path="/techs/:id" element={<TechPage />} />
              <Route path="/subcategories/:id" element={<SubcategoryPage />} />
            </Routes>
          </div>
        </div>
        <ChatFab />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
