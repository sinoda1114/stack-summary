import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMediaQuery } from "@mantine/hooks";
import { Link, NavLink } from "react-router";

const NARROW_NAV_QUERY = "(max-width: 768px)";

type NavIconName = "grid" | "relations" | "import" | "memo" | "inbox" | "taxonomy" | "export";

export function AppNav() {
  const mobile = useMediaQuery(NARROW_NAV_QUERY, false, { getInitialValueInEffect: false });
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobile) {
      setOpen(false);
    }
  }, [mobile]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    drawerRef.current?.focus();
  }, [open]);

  function close(): void {
    setOpen(false);
  }

  function closeFromChrome(): void {
    setOpen(false);
    menuRef.current?.focus();
  }

  const body = <NavBody mobile={mobile} onSelect={mobile ? close : undefined} />;

  if (!mobile) {
    return <aside className="sidebar">{body}</aside>;
  }

  return (
    <>
      <header className="mobile-bar">
        <button
          ref={menuRef}
          type="button"
          className="nav-menu"
          aria-label="メニューを開く"
          aria-expanded={open}
          aria-controls={open ? "app-nav-drawer" : undefined}
          onClick={() => {
            setOpen(true);
          }}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </header>
      {open ? (
        <>
          <button type="button" className="drawer-scrim" aria-label="メニューを閉じる" onClick={closeFromChrome} />
          <aside
            ref={drawerRef}
            id="app-nav-drawer"
            className="sidebar sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
            tabIndex={-1}
          >
            {body}
          </aside>
        </>
      ) : null}
    </>
  );
}

function NavBody(props: { mobile: boolean; onSelect?: () => void }) {
  return (
    <>
      <Link to="/" className="wordmark" onClick={props.onSelect}>
        <span className="mark">S</span>
        <span>
          <b>STACK</b>
          <span className="wordmark-sub">Summary</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="画面">
        <Item to="/" end icon="grid" label="全体図" onSelect={props.onSelect} />
        <Item to="/relations" icon="relations" label="関係" onSelect={props.onSelect} />
        <Item to="/imports" icon="import" label="取り込み" onSelect={props.onSelect} />
        <Item to="/memos" icon="memo" label="メモ" onSelect={props.onSelect} />
        {props.mobile ? null : (
          <>
            <Item to="/inbox" icon="inbox" label="受け箱" onSelect={props.onSelect} />
            <Item to="/taxonomy" icon="taxonomy" label="分類" onSelect={props.onSelect} />
            <Item to="/export" icon="export" label="書き出し" onSelect={props.onSelect} />
          </>
        )}
      </nav>
    </>
  );
}

function Item(props: { to: string; end?: boolean; icon: NavIconName; label: string; onSelect?: () => void }) {
  return (
    <NavLink to={props.to} end={props.end} className="nav-link" onClick={props.onSelect}>
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
    case "relations":
      return (
        <svg {...common}>
          <circle cx="7" cy="8" r="2.2" />
          <circle cx="17" cy="16" r="2.2" />
          <path d="M9.2 9.4 14.8 14.2" />
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
