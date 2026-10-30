'use client';
import { useActionState, useState } from 'react';
import { ChefHat, Eye, EyeOff, LockKeyhole, ArrowRight } from 'lucide-react';
import { signIn } from '../auth/actions';
export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: '' });
  const [show, setShow] = useState(false);
  return <main className="login-page"><div className="login-art"><ChefHat size={80} strokeWidth={1.3} /><p>El buen sabor empieza<br />con una buena gestión.</p><span>POLLOS ROLY · BOLIVIA</span></div><section className="login-card"><div className="login-brand"><ChefHat size={35} /><span>pollos <b>roly</b></span></div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Bienvenido a tu negocio.</h1><p>Inicia sesión para administrar Pollos Roly.</p><form action={action} className="entity-form"><label>Correo electrónico<input name="email" type="email" autoComplete="username" required maxLength={254} placeholder="Tu correo de administrador" disabled={pending} /></label><label>Contraseña<div className="password-field"><input name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} disabled={pending} /><button type="button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{state.error && <p className="error-banner" role="alert">{state.error}</p>}<button className="button primary login-submit" disabled={pending} type="submit">{pending ? 'Iniciando sesión…' : 'Entrar al administrador'}<ArrowRight size={17} /></button></form><div className="login-security"><LockKeyhole size={14} />Conexión protegida con Supabase</div></section></main>;
}
