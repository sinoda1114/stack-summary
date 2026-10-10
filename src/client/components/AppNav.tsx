import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useIsMobile } from "../hooks/useIsMobile";

type NavIconName = "grid" | "import" | "memo" | "inbox" | "taxonomy" | "export";

export function AppNav() {
  const mobile = useIsMobile();
  return (
    <aside className="sidebar">
      <Link to="/" className="wordmark">
        <span className="mark">S</span>
        <span>
          <b>STACK</b>
          <span className="wordmark-sub">Summary</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="画面">
        <Item to="/" end icon="grid" label="全体図" />
        <Item to="/imports" icon="import" label="取り込み" />
        <Item to="/memos" icon="memo" label="メモ" />
        {mobile ? null : (
          <>
            <Item to="/inbox" icon="inbox" label="受け箱" />
            <Item to="/taxonomy" icon="taxonomy" label="分類" />
            <Item to="/export" icon="export" label="書き出し" />
          </>
        )}
      </nav>
    </aside>
  );
}

function Item(props: { to: string; end?: boolean; icon: NavIconName; label: string }) {
  return (
    <NavLink to={props.to} end={props.end} className="nav-link">
      <NavIcon name={props.icon} />
      {props.label}
    </NavLink>
  );
}

function NavIcon(props: { name: NavIconName }): ReactNode {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (props.name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" />
          <rect x="13.5" y="3.5" width="7" height="7" />
          <rect x="3.5" y="13.5" width="7" height="7" />
          <rect x="13.5" y="13.5" width="7" height="7" />
        </svg>
      );
    case "import":
      return (
        <svg {...common}>
          <path d="M12 3.5v9" />
          <path d="m8 9.5 4 4 4-4" />
          <path d="M5 16.5h14V20H5z" />
        </svg>
      );
    case "memo":
      return (
        <svg {...common}>
          <path d="M7 3.5h7.2L18 7.2V20.5H7z" />
          <path d="M14 3.7V8h4.2" />
          <path d="M10 12h5" />
          <path d="M10 15.5h5" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <path d="m4 13 2.4-8h11.2L20 13" />
          <path d="M4 13h4.1a3.9 3.9 0 0 0 7.8 0H20v6.5H4z" />
        </svg>
      );
    case "taxonomy":
      return (
        <svg {...common}>
          <path d="M5 6h6v5H5z" />
          <path d="M13 6h6v5h-6z" />
          <path d="M9 14.5h6v5H9z" />
          <path d="M8 11v1.8h8" />
          <path d="M12 12.8v1.7" />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path d="M12 14.5V4" />
          <path d="m8 7.5 4-4 4 4" />
          <path d="M5 16.5h14V20H5z" />
        </svg>
      );
    default: {
      const unreachable: never = props.name;
      return unreachable;
    }
  }
}
