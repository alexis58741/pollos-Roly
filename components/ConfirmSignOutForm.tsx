'use client';

import type { FormEvent, ReactNode } from 'react';
import { signOut } from '../app/auth/actions';

export default function ConfirmSignOutForm({ children, className }: { children: ReactNode; className?: string }) {
  function confirmSignOut(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm('¿Seguro que quieres cerrar sesión?')) event.preventDefault();
  }

  return <form action={signOut} className={className} onSubmit={confirmSignOut}>{children}</form>;
}
