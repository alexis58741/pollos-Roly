'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, LockKeyhole, Mail, Plus, Save, UserRound, X } from 'lucide-react';
import type { Branch } from '../lib/data';

type Values = { name: string; surname: string; phone: string; email: string; password: string; role: string; branch: string };
export default function AddSystemUser({ branches, saving, error, cancel, submit }: { branches: Branch[]; saving: boolean; error: string; cancel: () => void; submit: (values: Values) => Promise<boolean> }) {
  const ref = useRef<HTMLDialogElement>(null); const [formError,setFormError]=useState(''); const [showPassword,setShowPassword]=useState(false);
  useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[]);
  async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const v={name:String(f.get('name')||'').trim(),surname:String(f.get('surname')||'').trim(),phone:String(f.get('phone')||'').trim(),email:String(f.get('email')||'').trim(),password:String(f.get('password')||''),role:String(f.get('role')||''),branch:String(f.get('branch')||'')};if(v.password.length<6){setFormError('La contraseña debe tener al menos 6 caracteres.');return}setFormError('');if(await submit(v))cancel()}
  return <dialog ref={ref} className="modal user-create-modal" aria-labelledby="user-create-title" onCancel={e=>{if(saving)e.preventDefault();else cancel()}} onClick={e=>{if(e.target===e.currentTarget&&!saving)cancel()}}>
    <div className="modal-heading"><div className="user-title"><UserRound size={21}/><h2 id="user-create-title">Crear cuenta del sistema</h2></div><button className="icon-button" aria-label="Cerrar" disabled={saving} onClick={cancel}><X size={21}/></button></div>
    <form className="user-create-form" onSubmit={save}>
      <div className="user-name-fields"><label>NOMBRE <b>*</b><input name="name" required maxLength={100} autoFocus placeholder="Ej. Juan"/></label><label>APELLIDO <b>*</b><input name="surname" required maxLength={100} placeholder="Ej. Pérez"/></label></div>
      <label>TELÉFONO CONTACTO<input name="phone" type="tel" maxLength={30} placeholder="+591 7XXXXXXX"/></label>
      <label>ROL CON ACCESO AL SISTEMA <b>*</b><select name="role" required defaultValue="Cajero"><option value="Administrador">Administrador</option><option value="Cajero">Cajero (Punto de Venta)</option></select><small>Las cuentas de acceso solo se crean para Administradores y Cajeros. Registra los demás puestos en el apartado Empleados.</small></label>
      <section className="user-credentials"><h3>🔐 Credenciales de acceso para el nuevo empleado</h3><label><span><Mail size={16}/> CORREO ELECTRÓNICO (Usuario)</span><input name="email" type="email" required maxLength={254} placeholder="juan.cajero@negocio.com" autoComplete="off"/></label><label><span><LockKeyhole size={16}/> CONTRASEÑA MÍNIMA</span><div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={6} maxLength={128} placeholder="Mín. 6 caracteres" autoComplete="new-password"/><button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label><p>La contraseña se envía a Supabase Auth. El perfil guarda el rol y los datos de contacto, nunca la contraseña.</p></section>
      <label>SUCURSAL<select name="branch" defaultValue=""><option value="">Sin sucursal asignada</option>{branches.map(b=><option key={b.id} value={b.id} disabled={!b.active}>{b.name}{b.active?'':' (Inactiva)'}</option>)}</select>{!branches.some(b=>b.active)&&<small className="user-branch-hint">No hay sucursales activas. Puedes crear una o activar una desde el apartado Sucursales.</small>}</label>
      {(formError||error)&&<p className="error-banner" role="alert">{formError||error}</p>}
      <div className="modal-footer"><button type="button" className="button" disabled={saving} onClick={cancel}>Cancelar</button><button type="submit" className="button primary" disabled={saving}><Save size={17}/>{saving?'Creando…':'Dar de alta'}</button></div>
    </form>
  </dialog>;
}
