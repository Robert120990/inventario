import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Palette, Check, Sparkles } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';

const THEMES = [
  { id: 'light', name: 'Luminous Claro', icon: <Sun size={15} />, color: '#006d32', glow: '#00d166', bg: '#f8f9ff' },
  { id: 'dark', name: 'Luminous Oscuro', icon: <Moon size={15} />, color: '#30e375', glow: '#64ff92', bg: '#090f1d' },
  { id: 'navy', name: 'Deep Ocean', icon: <Palette size={15} />, color: '#38bdf8', glow: '#7dd3fc', bg: '#071329' },
  { id: 'emerald', name: 'Bio Forest', icon: <Palette size={15} />, color: '#10b981', glow: '#34d399', bg: '#051c19' }
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

  if (variant === 'sidebar') {
    return (
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'white',
            borderRadius: 'var(--radius)',
            padding: '0.45rem 0.65rem',
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: currentThemeObj.color, display: 'inline-block', boxShadow: `0 0 6px ${currentThemeObj.color}` }}></span>
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
            backgroundColor: 'var(--color-card)',
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
                  padding: '0.5rem 0.65rem',
                  border: 'none',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  backgroundColor: theme === t.id ? 'var(--color-primary)' : 'transparent',
                  color: theme === t.id ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: theme === t.id ? '600' : 'normal',
                  textAlign: 'left',
                  transition: 'var(--transition)'
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
          padding: '0.45rem 0.8rem',
          fontSize: '0.8rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.45rem',
          borderRadius: 'var(--radius)'
        }}
        title="Cambiar tema visual"
      >
        <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: currentThemeObj.color, display: 'inline-block', boxShadow: `0 0 6px ${currentThemeObj.color}` }}></span>
        <span>{currentThemeObj.name}</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '0.5rem',
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: '0.4rem',
          minWidth: '170px',
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
                textAlign: 'left',
                transition: 'var(--transition)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: t.color, display: 'inline-block' }}></span>
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
