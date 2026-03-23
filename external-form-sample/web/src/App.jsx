import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ExpenseAppProvider } from "./context/ExpenseAppBridge.jsx";
import Layout from "./components/Layout.jsx";
import CreateExpensePage from "./pages/CreateExpensePage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ImportBankPage from "./pages/ImportBankPage.jsx";

/** HashRouter: works on GitHub Pages without duplicating index.html as 404.html. */
export default function App() {
  return (
    <ExpenseAppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CreateExpensePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/import-bank" element={<ImportBankPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ExpenseAppProvider>
  );
}
