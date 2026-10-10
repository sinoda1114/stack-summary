import { Link, NavLink } from "react-router";
import { useIsMobile } from "../hooks/useIsMobile";

export function AppNav() {
  const mobile = useIsMobile();
  return (
    <header className="masthead">
      <Link to="/" className="wordmark">
        stack-summary
      </Link>
      <nav className="nav-links">
        <NavLink to="/" end className="nav-link">
          全体図
        </NavLink>
        <NavLink to="/imports" className="nav-link">
          取り込み
        </NavLink>
        <NavLink to="/memos" className="nav-link">
          メモ
        </NavLink>
        {mobile ? null : (
          <>
            <NavLink to="/inbox" className="nav-link">
              受け箱
            </NavLink>
            <NavLink to="/taxonomy" className="nav-link">
              分類
            </NavLink>
            <NavLink to="/export" className="nav-link">
              書き出し
            </NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
