import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { ImportPage } from "./pages/ImportPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SubcategoryPage } from "./pages/SubcategoryPage";
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
        <p>
          <Link to="/">全体図</Link> <Link to="/imports">取り込み</Link>
        </p>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/imports" element={<ImportPage />} />
          <Route path="/techs/:id" element={<TechPage />} />
          <Route path="/subcategories/:id" element={<SubcategoryPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
