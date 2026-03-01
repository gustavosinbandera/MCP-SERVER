'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme, type ThemeId } from './theme';

type NavItem = { href: string; label: string };

const ITEMS: NavItem[] = [
  { href: '/', label: 'Search' },
  { href: '/upload', label: 'Upload' },
  { href: '/files', label: 'Files' },
  { href: '/azure-tasks', label: 'Azure' },
  { href: '/azure-changesets', label: 'Changesets' },
  { href: '/mcp-tools', label: 'MCP Tools' },
];

export function TopNav() {
  const pathname = usePathname() || '/';
  const { theme, setTheme, themes } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  const currentThemeLabel = useMemo(() => {
    return themes.find((t) => t.id === theme)?.label ?? 'Theme';
  }, [theme, themes]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setThemeOpen(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (!themeOpen) return;
      if (themeMenuRef.current?.contains(target)) return;
      if (themeBtnRef.current?.contains(target)) return;
      setThemeOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [themeOpen]);

  return (
    <header className="topNav">
      <div className="topNavInner">
        <button
          type="button"
          className="iconButton"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="iconBurger" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <Link href="/" className="brand" aria-label="MCP Knowledge Hub">
          <span className="brandDot" />
          MCP Knowledge Hub
        </Link>
        <nav className="navLinks" aria-label="Primary">
          {ITEMS.map((it) => {
            const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`navLink${active ? ' navLinkActive' : ''}`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="navRight">
          <div className="themePicker">
            <span className="themeLabel">Theme</span>
            <button
              ref={themeBtnRef}
              type="button"
              className="themeButton"
              aria-haspopup="menu"
              aria-expanded={themeOpen}
              onClick={() => setThemeOpen((v) => !v)}
            >
              <span className="themeDot" aria-hidden="true" />
              {currentThemeLabel}
              <span className="themeChevron" aria-hidden="true" />
            </button>
            {themeOpen && (
              <div ref={themeMenuRef} className="themeMenu" role="menu" aria-label="Theme menu">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={t.id === theme}
                    className={`themeMenuItem${t.id === theme ? ' themeMenuItemActive' : ''}`}
                    onClick={() => {
                      setTheme(t.id as ThemeId);
                      setThemeOpen(false);
                    }}
                  >
                    <span className="themeDot" aria-hidden="true" />
                    <span className="themeMenuText">{t.label}</span>
                    {t.id === theme && <span className="themeCheck" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div
          className="drawerOverlay"
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="drawer"
            role="dialog"
            aria-label="Menu"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawerHeader">
              <span className="drawerTitle">Menu</span>
              <button type="button" className="iconButton" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
                <span className="iconX" aria-hidden="true">×</span>
              </button>
            </div>
            <div className="drawerSection">
              <div className="drawerSectionTitle">Navigation</div>
              <div className="drawerLinks">
                {ITEMS.map((it) => {
                  const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      className={`drawerLink${active ? ' drawerLinkActive' : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="drawerSection">
              <div className="drawerSectionTitle">Coming soon</div>
              <div className="drawerPlaceholder">
                <div className="drawerPlaceholderItem">Saved searches</div>
                <div className="drawerPlaceholderItem">Recent uploads</div>
                <div className="drawerPlaceholderItem">Pinned tools</div>
                <div className="drawerPlaceholderItem">Settings</div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}

