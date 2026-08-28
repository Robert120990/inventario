import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { WINDOWS_THEMES } from '../../config/themes';

export const ThemeToggle = ({ variant = 'button' }) => {
  const { theme, setTheme } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Mapear compatibilidad para temas anteriores
  const normalizedTheme = 
    theme === 'navy' ? 'dark' : 
    theme === 'emerald' ? 'sunrise' : 
    theme || 'light';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentThemeObj = WINDOWS_THEMES.find(t => t.id === normalizedTheme) || WINDOWS_THEMES[0];

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
          title="Personalizar Tema (Windows 11)"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span 
              style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                backgroundColor: currentThemeObj.color, 
                display: 'inline-block', 
                boxShadow: `0 0 8px ${currentThemeObj.color}` 
              }} 
            />
            <span style={{ fontWeight: '500' }}>{currentThemeObj.name}</span>
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
            {WINDOWS_THEMES.map(t => {
              const isSelected = normalizedTheme === t.id;
              return (
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
                    backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: isSelected ? 'white' : 'var(--color-text)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? '600' : 'normal',
                    textAlign: 'left',
                    transition: 'var(--transition)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span 
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        backgroundColor: t.color, 
                        display: 'inline-block',
                        boxShadow: `0 0 6px ${t.color}` 
                      }} 
                    />
                    <span>{t.name}</span>
                  </span>
                  {isSelected && <Check size={13} />}
                </button>
              );
            })}
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
          gap: '0.5rem',
          borderRadius: 'var(--radius)'
        }}
        title="Personalizar Tema (Windows 11)"
      >
        <span 
          style={{ 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            backgroundColor: currentThemeObj.color, 
            display: 'inline-block', 
            boxShadow: `0 0 6px ${currentThemeObj.color}` 
          }} 
        />
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
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '0.5rem',
          minWidth: '220px',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem'
        }}>
          <div style={{ padding: '0.35rem 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', fontWeight: '700' }}>
            Temas Windows 11
          </div>
          {WINDOWS_THEMES.map(t => {
            const isSelected = normalizedTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTheme(t.id); setIsOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.55rem 0.75rem',
                  border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: isSelected ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? '600' : 'normal',
                  textAlign: 'left',
                  transition: 'var(--transition)'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span 
                    style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: t.color, 
                      display: 'inline-block',
                      boxShadow: `0 0 6px ${t.color}` 
                    }} 
                  />
                  <span>
                    <span style={{ display: 'block', lineHeight: 1.2 }}>{t.name}</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', opacity: isSelected ? 0.9 : 0.65 }}>
                      {t.subtitle}
                    </span>
                  </span>
                </span>
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
