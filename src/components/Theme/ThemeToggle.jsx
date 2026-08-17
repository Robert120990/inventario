import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Palette, Check } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';

const THEMES = [
  { id: 'light', name: 'Modo Claro', icon: <Sun size={16} />, color: '#1e3a8a', bg: '#f8fafc' },
  { id: 'dark', name: 'Modo Oscuro', icon: <Moon size={16} />, color: '#3b82f6', bg: '#0b0f19' },
  { id: 'navy', name: 'Azul Noche', icon: <Palette size={16} />, color: '#38bdf8', bg: '#08122d' },
  { id: 'emerald', name: 'Esmeralda', icon: <Palette size={16} />, color: '#10b981', bg: '#051c19' }
];

export const ThemeToggle = ({ variant = 'button' }) => {
  const { theme, setTheme } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentThemeObj = THEMES.find(t => t.id === theme) || THEMES[0];

  const handleQuickToggle = () => {
    // Toggle between light and dark
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  if (variant === 'sidebar') {
    return (
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: 'white',
            borderRadius: 'var(--radius)',
            padding: '0.4rem 0.6rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.75rem',
            width: '100%',
            justifyContent: 'space-between',
            transition: 'var(--transition)'
          }}
          title="Cambiar tema visual"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {currentThemeObj.icon}
            <span>{currentThemeObj.name}</span>
          </span>
          <Palette size={13} style={{ opacity: 0.7 }} />
        </button>

        {isOpen && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            width: '100%',
            marginBottom: '0.5rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.35rem',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem'
          }}>
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTheme(t.id); setIsOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.6rem',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  backgroundColor: theme === t.id ? 'var(--color-primary)' : 'transparent',
                  color: theme === t.id ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: theme === t.id ? '600' : 'normal',
                  textAlign: 'left'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: t.color, display: 'inline-block' }}></span>
                  {t.name}
                </span>
                {theme === t.id && <Check size={13} />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={dropdownRef}>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '0.45rem 0.75rem',
          fontSize: '0.8rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}
        title="Cambiar tema visual"
      >
        {currentThemeObj.icon}
        <span>{currentThemeObj.name}</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.4rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: '0.4rem',
          minWidth: '160px',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem'
        }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTheme(t.id); setIsOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                border: 'none',
                borderRadius: 'calc(var(--radius) - 2px)',
                backgroundColor: theme === t.id ? 'var(--color-primary)' : 'transparent',
                color: theme === t.id ? 'white' : 'var(--color-text)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: theme === t.id ? '600' : 'normal',
                textAlign: 'left'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: t.color, display: 'inline-block' }}></span>
                {t.name}
              </span>
              {theme === t.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
