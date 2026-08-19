import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check, RotateCcw } from 'lucide-react';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPresetRanges = () => {
  const now = new Date();
  const today = getLocalDateStr(now);
  
  // Ayer
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterday = getLocalDateStr(yest);
  
  // Esta semana (Lunes a Hoy)
  const dayOfWeek = now.getDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - distanceToMonday);
  const thisWeekStart = getLocalDateStr(monday);
  
  // Mes Actual (1 al día actual)
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthStart = getLocalDateStr(firstDayThisMonth);
  
  // Mes Anterior (1 al último día)
  const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonthStart = getLocalDateStr(firstDayPrevMonth);
  const prevMonthEnd = getLocalDateStr(lastDayPrevMonth);
  
  // Últimos 7 Días
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 6);
  const last7Days = getLocalDateStr(d7);
  
  // Últimos 15 Días
  const d15 = new Date(now);
  d15.setDate(d15.getDate() - 14);
  const last15Days = getLocalDateStr(d15);
  
  // Últimos 30 Días
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 29);
  const last30Days = getLocalDateStr(d30);
  
  // Este Año
  const firstDayThisYear = new Date(now.getFullYear(), 0, 1);
  const thisYearStart = getLocalDateStr(firstDayThisYear);

  return [
    { id: 'this-month', label: 'Mes Actual', start: thisMonthStart, end: today },
    { id: 'prev-month', label: 'Mes Anterior', start: prevMonthStart, end: prevMonthEnd },
    { id: 'last-7', label: 'Últimos 7 Días', start: last7Days, end: today },
    { id: 'last-15', label: 'Últimos 15 Días', start: last15Days, end: today },
    { id: 'last-30', label: 'Últimos 30 Días', start: last30Days, end: today },
    { id: 'this-week', label: 'Esta Semana', start: thisWeekStart, end: today },
    { id: 'today', label: 'Hoy', start: today, end: today },
    { id: 'this-year', label: 'Este Año', start: thisYearStart, end: today }
  ];
};

/**
 * Componente DatePicker interactivo con soporte de calendario desplegable visual,
 * navegación por meses/años, selección rápida y disparador de calendario nativo.
 */
export const DatePicker = ({
  value,
  onChange,
  label,
  placeholder = 'YYYY-MM-DD',
  min,
  max,
  className = '',
  disabled = false,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Fecha de vista para el calendario desplegable
  const initialDate = value ? new Date(value + 'T12:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear() || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth() || new Date().getMonth());

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (dayNum, isOtherMonth = false, isPrev = false) => {
    let targetYear = viewYear;
    let targetMonth = viewMonth;

    if (isOtherMonth) {
      if (isPrev) {
        if (viewMonth === 0) {
          targetMonth = 11;
          targetYear -= 1;
        } else {
          targetMonth -= 1;
        }
      } else {
        if (viewMonth === 11) {
          targetMonth = 0;
          targetYear += 1;
        } else {
          targetMonth += 1;
        }
      }
    }

    const mStr = String(targetMonth + 1).padStart(2, '0');
    const dStr = String(dayNum).padStart(2, '0');
    const dateStr = `${targetYear}-${mStr}-${dStr}`;

    onChange(dateStr);
    setIsOpen(false);
  };

  const handleSetToday = (e) => {
    e.stopPropagation();
    const todayStr = getLocalDateStr(new Date());
    onChange(todayStr);
    setIsOpen(false);
  };

  const handleToggleOrNativePicker = (e) => {
    // Si el usuario da clic en el icono o campo, intentamos abrir showPicker o alternar el menú visual
    setIsOpen(prev => !prev);
  };

  // Construir matriz de días para el mes visible
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  // Ajuste para que la semana empiece en Lunes (0=Lu, 6=Do)
  const startingDayIndex = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const todayStr = getLocalDateStr(new Date());

  const daysGrid = [];

  // Días del mes anterior
  for (let i = startingDayIndex - 1; i >= 0; i--) {
    daysGrid.push({
      day: daysInPrevMonth - i,
      isOtherMonth: true,
      isPrev: true
    });
  }

  // Días del mes actual
  for (let i = 1; i <= daysInMonth; i++) {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(i).padStart(2, '0');
    const fullDateStr = `${viewYear}-${mStr}-${dStr}`;
    daysGrid.push({
      day: i,
      isOtherMonth: false,
      dateStr: fullDateStr,
      isSelected: value === fullDateStr,
      isToday: todayStr === fullDateStr
    });
  }

  // Días del siguiente mes para completar filas
  const remainingCells = (7 - (daysGrid.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    daysGrid.push({
      day: i,
      isOtherMonth: true,
      isPrev: false
    });
  }

  // Lista de años disponibles para salto rápido
  const currentYear = new Date().getFullYear();
  const yearsList = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) {
    yearsList.push(y);
  }

  return (
    <div className={`date-picker-container ${className}`} ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {label && <label className="form-label">{label}</label>}
      <div 
        className="date-picker-input-wrap"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%'
        }}
      >
        <input
          ref={inputRef}
          type="date"
          className="form-input custom-date-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          disabled={disabled}
          required={required}
          style={{
            paddingRight: '2.5rem',
            cursor: 'pointer'
          }}
          onClick={() => setIsOpen(true)}
        />
        <button
          type="button"
          onClick={handleToggleOrNativePicker}
          disabled={disabled}
          className="date-picker-icon-btn"
          title="Abrir calendario visual"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'var(--transition)'
          }}
        >
          <Calendar size={18} />
        </button>
      </div>

      {/* Popover visual del Calendario */}
      {isOpen && (
        <div
          className="calendar-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 1050,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.85rem',
            width: '280px',
            userSelect: 'none',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Header de navegación mes y año */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="calendar-nav-btn"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--color-text)'
              }}
              title="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                style={{
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>{name}</option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                style={{
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {yearsList.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="calendar-nav-btn"
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--color-text)'
              }}
              title="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Días de la semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', marginBottom: '4px' }}>
            {DAY_NAMES.map((d, i) => (
              <span key={i} style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-light)', padding: '2px 0' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Grilla de días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', textAlign: 'center' }}>
            {daysGrid.map((item, idx) => {
              if (item.isOtherMonth) {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(item.day, true, item.isPrev)}
                    style={{
                      height: '30px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-light)',
                      opacity: 0.35,
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {item.day}
                  </button>
                );
              }

              const isSelected = item.isSelected;
              const isToday = item.isToday;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(item.day, false)}
                  style={{
                    height: '30px',
                    background: isSelected ? 'var(--color-primary)' : isToday ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    color: isSelected ? '#ffffff' : isToday ? 'var(--color-primary)' : 'var(--color-text)',
                    fontWeight: isSelected || isToday ? '600' : 'normal',
                    border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease'
                  }}
                  className="calendar-day-btn"
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer del calendario */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.65rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--color-border)',
              fontSize: '0.75rem'
            }}
          >
            <button
              type="button"
              onClick={handleSetToday}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '2px 4px'
              }}
            >
              <RotateCcw size={12} /> Seleccionar Hoy
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text)',
                padding: '2px 8px',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Barra de atajos rápidos de rango de fechas ("Mes Actual", "Mes Anterior", "Últimos 7 Días", etc.)
 */
export const DateQuickPresets = ({ startDate, endDate, onSelectRange, activePresets = ['this-month', 'prev-month', 'last-7', 'last-30', 'today'] }) => {
  const allPresets = getPresetRanges();
  const presets = allPresets.filter(p => activePresets.includes(p.id));

  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-light)', marginRight: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <Calendar size={13} style={{ color: 'var(--color-primary)' }} /> Atajos:
      </span>
      {presets.map(p => {
        const isActive = startDate === p.start && endDate === p.end;
        return (
          <button
            key={p.id}
            type="button"
            className={`date-preset-pill ${isActive ? 'active' : ''}`}
            onClick={() => onSelectRange(p.start, p.end)}
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
              background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
              color: isActive ? '#ffffff' : 'var(--color-text)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.15s ease'
            }}
          >
            {isActive && <Check size={11} />}
            {p.label}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Selector completo de Rango de Fechas (Fecha Inicio + Fecha Fin) con atajos integrados
 */
export const DateRangeSelector = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  showPresets = true
}) => {
  const handleSelectRange = (start, end) => {
    onStartDateChange(start);
    onEndDateChange(end);
  };

  const handleStartChange = (newStart) => {
    onStartDateChange(newStart);
    // Si la nueva fecha de inicio es mayor que la fecha fin actual, ajustamos la fecha fin
    if (endDate && newStart > endDate) {
      onEndDateChange(newStart);
    }
  };

  const handleEndChange = (newEnd) => {
    onEndDateChange(newEnd);
    // Si la nueva fecha de fin es menor que la fecha inicio actual, ajustamos la fecha de inicio
    if (startDate && newEnd < startDate) {
      onStartDateChange(newEnd);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {showPresets && (
        <DateQuickPresets
          startDate={startDate}
          endDate={endDate}
          onSelectRange={handleSelectRange}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <DatePicker
          label="Fecha Inicio"
          value={startDate}
          onChange={handleStartChange}
          max={endDate}
        />
        <DatePicker
          label="Fecha Fin"
          value={endDate}
          onChange={handleEndChange}
          min={startDate}
        />
      </div>
    </div>
  );
};

export default DatePicker;
