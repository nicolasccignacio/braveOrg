import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <>
      <header className="md-top-app-bar">
        <div className="md-top-app-bar__inner">
          <nav className="md-nav" aria-label="Site">
            <NavLink to="/" end>
              Create expense
            </NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/import-bank">Import bank</NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
    </>
  );
}
