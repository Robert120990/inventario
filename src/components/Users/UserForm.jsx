import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Save, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';

const UserForm = ({ onCancel, initialData }) => {
  const { addUser, updateUser, users, roles } = useInventory();
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: initialData?.username || '',
    password: '',
    role_id: initialData?.role_id || (roles.find(r => r.name.toLowerCase() === (initialData?.role || 'user').toLowerCase())?.id || 1),
    role: initialData?.role || 'user',
    isActive: initialData ? initialData.isActive !== false : true
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'role_id') {
      const selectedRole = roles.find(r => r.id.toString() === value);
      const isAdm = selectedRole?.name.toLowerCase() === 'administrador';
      setFormData(prev => ({
        ...prev,
        role_id: Number(value),
        role: isAdm ? 'admin' : 'user'
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username.trim()) {
      setError('El nombre de usuario es obligatorio.');
      return;
    }

    if (!initialData && !formData.password.trim()) {
      setError('La contraseña es obligatoria para nuevos usuarios.');
      return;
    }

    if (!initialData && users.some(u => u.username.toLowerCase() === formData.username.trim().toLowerCase())) {
      setError('Este nombre de usuario ya existe.');
      return;
    }

    if (initialData && users.some(u => u.username.toLowerCase() === formData.username.trim().toLowerCase() && u.id !== initialData.id)) {
      setError('Este nombre de usuario ya está ocupado por otra cuenta.');
      return;
    }

    if (initialData) {
      const payload = {
        username: formData.username.trim(),
        role: formData.role,
        role_id: formData.role_id,
        isActive: formData.isActive
      };
      if (formData.password && formData.password.trim() !== '') {
        payload.password = formData.password.trim();
      }
      const res = await updateUser(initialData.id, payload);
      if (res.success) {
        toast.success('Usuario actualizado exitosamente');
        onCancel();
      } else {
        setError(res.message || 'Error al actualizar usuario');
      }
    } else {
      const res = await addUser({
        username: formData.username.trim(),
        password: formData.password.trim(),
        role: formData.role,
        role_id: formData.role_id,
        isActive: true
      });
      if (res.success) {
        toast.success('Usuario creado exitosamente');
        onCancel();
      } else {
        setError(res.message || 'Error al crear usuario');
      }
    }
  };

  return (
    <div>
      <div className="topbar" style={{ marginBottom: '1.5rem', borderBottom: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>
          {initialData ? 'Editar Usuario' : 'Nuevo Usuario'}
        </h2>
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
          <label className="form-label">
            Contraseña {initialData && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', fontWeight: 'normal' }}>(Dejar en blanco para mantener la actual)</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              name="password" 
              className="form-input" 
              value={formData.password} 
              onChange={handleChange} 
              placeholder={initialData ? "••••••••" : "Contraseña segura"}
              required={!initialData}
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
          <select name="role_id" className="form-select" value={formData.role_id} onChange={handleChange}>
            {roles.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} {r.description ? `(${r.description})` : ''}
              </option>
            ))}
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
