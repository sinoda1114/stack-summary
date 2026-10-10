import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { ImportPage } from "./pages/ImportPage";
import "@mantine/core/styles.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("描画先がありません");
}

createRoot(root).render(
  <StrictMode>
    <MantineProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/imports" element={<ImportPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);

function Home() {
  return (
    <p>
      <Link to="/imports">取り込み</Link>
    </p>
  );
}
