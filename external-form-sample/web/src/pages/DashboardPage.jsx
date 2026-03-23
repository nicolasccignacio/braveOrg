import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useExpenseAppBridge } from "../context/ExpenseAppBridge.jsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function dashboardChartTheme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    text: dark ? "#e6e0e9" : "#49454f",
    grid: dark ? "rgba(230, 224, 233, 0.12)" : "rgba(73, 69, 79, 0.15)",
    fillLine: dark ? "rgba(208, 188, 255, 0.35)" : "rgba(103, 80, 164, 0.2)",
    strokeLine: dark ? "#d0bcff" : "#6750a4",
    bar: dark ? "rgba(204, 194, 220, 0.8)" : "rgba(98, 91, 113, 0.65)",
  };
}

export default function DashboardPage() {
  const { version } = useExpenseAppBridge();
  const [meta, setMeta] = useState("");
  const [msg, setMsg] = useState("");
  const [totals, setTotals] = useState({ expenseCount: "—", amountSum: "—" });
  const [monthData, setMonthData] = useState(null);
  const [itemData, setItemData] = useState(null);
  const [loading, setLoading] = useState(false);

  const dashHint = useMemo(() => {
    const a = window.ExpenseApp;
    const sf = a?.usesSalesforceBackend?.() ?? false;
    const sb = a?.usesSupabaseBackend?.() ?? false;
    if (sf) {
      return "Charts use Expense_Item_Price__c rows from Salesforce (standard REST), same session as the main form.";
    }
    if (sb) {
      return "Charts use expenses stored in Supabase for your signed-in user (same session as Create expense).";
    }
    return "Charts use expenses in this browser (localStorage). Sign in on Create expense to use Supabase.";
  }, [version]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const agg = await window.ExpenseApp.dashboard(2000);
      setTotals({
        expenseCount: String(agg.totals?.expenseCount ?? "—"),
        amountSum: String(agg.totals?.amountSum ?? "—"),
      });
      setMeta(
        `Showing up to ${agg.meta?.queryLimit ?? "—"} expenses (${agg.meta?.recordCount ?? "—"} loaded).`
      );
      const th = dashboardChartTheme();
      const byMonth = agg.byMonth || [];
      const byItem = agg.byItem || [];
      setMonthData({
        chart: {
          labels: byMonth.map((x) => x.label),
          datasets: [
            {
              label: "Amount",
              data: byMonth.map((x) => x.total),
              borderColor: th.strokeLine,
              backgroundColor: th.fillLine,
              fill: true,
              tension: 0.25,
            },
          ],
        },
        th,
      });
      setItemData({
        chart: {
          labels: byItem.map((x) => x.name),
          datasets: [
            {
              label: "Amount",
              data: byItem.map((x) => x.total),
              backgroundColor: th.bar,
            },
          ],
        },
        th,
      });
    } catch (e) {
      setMsg(String(e.message || e));
      setMonthData(null);
      setItemData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [version, loadDashboard]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && loadDashboard();
    const onShow = (ev) => ev.persisted && loadDashboard();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, [loadDashboard]);

  const monthOptions = useMemo(() => {
    const th = monthData?.th ?? dashboardChartTheme();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: th.text, maxRotation: 45, minRotation: 0 }, grid: { color: th.grid } },
        y: { ticks: { color: th.text }, grid: { color: th.grid } },
      },
    };
  }, [monthData]);

  const itemOptions = useMemo(() => {
    const th = itemData?.th ?? dashboardChartTheme();
    return {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: th.text, font: { size: 13 } }, grid: { color: th.grid } },
        y: {
          ticks: { color: th.text, autoSkip: false, font: { size: 13 } },
          grid: { display: false },
        },
      },
    };
  }, [itemData]);

  return (
    <main className="md-main md-container md-container--wide">
      <div className="page-head">
        <h1>Dashboard</h1>
        <button type="button" className="md-btn md-btn--outlined" disabled={loading} onClick={() => loadDashboard()}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "1.125rem" }}>
            refresh
          </span>
          Refresh
        </button>
      </div>

      <p className="dashboard-meta" aria-live="polite">
        {meta}
      </p>
      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-value">{totals.expenseCount}</span>
          <span className="stat-label">Expenses (in sample)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totals.amountSum}</span>
          <span className="stat-label">Total amount (price × qty)</span>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <h2>Amount by month</h2>
          <div className="chart-canvas-wrap">
            {monthData ? <Line data={monthData.chart} options={monthOptions} aria-label="Amount by month" /> : null}
          </div>
        </div>
        <div className="chart-card">
          <h2>Top items by amount</h2>
          <div className="chart-canvas-wrap">
            {itemData ? <Bar data={itemData.chart} options={itemOptions} aria-label="Top items by amount" /> : null}
          </div>
        </div>
      </div>

      {msg ? (
        <p className="dashboard-status" role="status">
          {msg}
        </p>
      ) : null}
      <p className="hint md-body-text" style={{ maxWidth: "42rem" }}>
        {dashHint}
      </p>
    </main>
  );
}
