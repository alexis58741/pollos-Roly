'use client';

import Image from 'next/image';
import { useActionState, useState } from 'react';
import { ArrowRight, ChefHat, Eye, EyeOff, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { signIn } from '../auth/actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { error: '' });
  const [show, setShow] = useState(false);

  return (
    <main className="login-page">
      <section className="login-art" aria-label="Pollos Roly">
        <div className="login-art-copy">
          <Image
            className="login-logo"
            src="/images/logo-pollos-roly.png"
            alt="Pollos Roly"
            width={190}
            height={190}
            priority
          />
          <h1>El buen sabor empieza<br />con una <span>buena gestión.</span></h1>
          <i className="login-red-rule" />
          <p className="login-location">POLLOS ROLY <b>·</b> BOLIVIA</p>
        </div>
        <Image
          className="login-chicken"
          src="/images/login-chicken.png"
          alt="Pollo asado de Pollos Roly"
          width={920}
          height={520}
          priority
        />
      </section>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-icon"><ChefHat size={34} strokeWidth={2.2} /></span>
          <span className="login-brand-text"><span>pollos <b>roly</b></span><small>ADMINISTRACIÓN</small></span>
        </div>
        <header className="login-heading">
          <h2 id="login-title">Bienvenido a tu negocio.</h2>
          <p>Inicia sesión para administrar Pollos Roly.</p>
        </header>

        <form action={action} className="login-form">
          <label htmlFor="login-email"><span><Mail size={18} />Correo electrónico</span></label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            placeholder="Tu correo de administrador"
            disabled={pending}
          />

          <label htmlFor="login-password"><span><LockKeyhole size={18} />Contraseña</span></label>
          <div className="login-password-field">
            <input
              id="login-password"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={1024}
              placeholder="Ingresa tu contraseña"
              disabled={pending}
            />
            <button
              className="login-show-password"
              type="button"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setShow(!show)}
              disabled={pending}
            >
              {show ? <EyeOff size={21} /> : <Eye size={21} />}
            </button>
          </div>

          {state.error && <p className="error-banner" role="alert">{state.error}</p>}

          <button className="login-submit" disabled={pending} type="submit">
            <LogIn size={22} />
            <span>{pending ? 'Iniciando sesión…' : 'Entrar al administrador'}</span>
            <ArrowRight size={25} />
          </button>
        </form>
      </section>
    </main>
  );
}
