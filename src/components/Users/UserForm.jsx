import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Save, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';

const UserForm = ({ onCancel, initialData }) => {
  const { addUser, updateUser, users } = useInventory();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState(initialData || {
    username: '',
    password: '',
    role: 'user',
    isActive: true
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      setError('El usuario y la contraseña son obligatorios.');
      return;
    }

    if (!initialData && users.some(u => u.username === formData.username)) {
      setError('Este nombre de usuario ya existe.');
      return;
    }

    if (initialData && users.some(u => u.username === formData.username && u.id !== initialData.id)) {
      setError('Este nombre de usuario ya existe en ocupado por otro.');
      return;
    }

    if (initialData) {
      updateUser(initialData.id, formData);
      toast.success('Usuario actualizado');
    } else {
      addUser({...formData, isActive: true });
      toast.success('Usuario creado exitosamente');
    }
    
    onCancel();
  };

  return (
    <div>
      <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>{initialData ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
        <button type="button" className="btn btn-outline" onClick={onCancel} style={{ padding: '0.25rem' }}>
          <X size={18} />
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: 'var(--color-danger)', color: 'white', padding: '0.75rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Nombre de Usuario</label>
          <input 
            type="text" 
            name="username" 
            className="form-input" 
            value={formData.username} 
            onChange={handleChange} 
            required 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Contraseña</label>
          <div style={{ position: 'relative' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              name="password" 
              className="form-input" 
              value={formData.password} 
              onChange={handleChange} 
              required 
              style={{ paddingRight: '2.5rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-light)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Rol del Sistema</label>
          <select name="role" className="form-select" value={formData.role} onChange={handleChange}>
            <option value="user">Usuario Básico</option>
            <option value="admin">Administrador</option>
          </select>
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary"><Save size={18} /> {initialData ? 'Guardar Cambios' : 'Crear Usuario'}</button>
        </div>
      </form>
    </div>
  );
};

export default UserForm;
