import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppNav } from "./components/AppNav";
import { ImportPage } from "./pages/ImportPage";
import { InboxPage } from "./pages/InboxPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SubcategoryPage } from "./pages/SubcategoryPage";
import { TaxonomyPage } from "./pages/TaxonomyPage";
import { TechPage } from "./pages/TechPage";
import "@mantine/core/styles.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("描画先がありません");
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider>
      <BrowserRouter>
        <AppNav />
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/imports" element={<ImportPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/taxonomy" element={<TaxonomyPage />} />
          <Route path="/techs/:id" element={<TechPage />} />
          <Route path="/subcategories/:id" element={<SubcategoryPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
