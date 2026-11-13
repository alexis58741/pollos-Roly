'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Download, Smartphone, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<'apple-mobile' | 'mac' | 'other'>('other');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    setPlatform(/iPhone|iPad|iPod/i.test(userAgent) ? 'apple-mobile' : /Macintosh/i.test(userAgent) ? 'mac' : 'other');
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (guideOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [guideOpen]);

  async function downloadApp() {
    if (!installPrompt) { setGuideOpen(true); return; }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } finally {
      setInstallPrompt(null);
    }
  }

  return <>
    <button type="button" className="sidebar-install-button" onClick={() => void downloadApp()}>
      <span className="sidebar-install-icon"><Download size={17} /></span>
      <span><strong>Descargar</strong><small>Instalar en este dispositivo</small></span>
    </button>
    <dialog ref={dialog} className="install-guide-dialog" onCancel={event => { event.preventDefault(); setGuideOpen(false); }} onClick={event => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
      <div className="install-guide-heading">
        <span className="sidebar-install-icon"><Smartphone size={18} /></span>
        <div><h2>{installed ? 'Pollos Roly ya está instalada' : 'Instalar Pollos Roly'}</h2><p>Agrega un acceso directo como aplicación en tu dispositivo.</p></div>
        <button className="icon-button" type="button" onClick={() => setGuideOpen(false)} aria-label="Cerrar"><X size={18} /></button>
      </div>
      <div className="install-guide-content">
        {platform === 'apple-mobile' ? <p><b>En iPhone o iPad:</b> abre esta página en Safari, toca <b>Compartir</b> y elige <b>Agregar a pantalla de inicio</b>.</p> : platform === 'mac' ? <p><b>En Mac:</b> abre Pollos Roly en Safari y elige <b>Archivo → Añadir al Dock</b>. En Chrome o Edge, usa el menú del navegador y elige <b>Instalar Pollos Roly</b>.</p> : <p><b>En Chrome o Edge:</b> abre el menú del navegador y elige <b>Instalar Pollos Roly</b> o <b>Agregar a pantalla principal</b>.</p>}
        <p className="install-guide-note"><Check size={16} /> La aplicación instalada necesita conexión a internet para sincronizar con el sistema.</p>
      </div>
      <div className="install-guide-actions"><button className="button primary" type="button" onClick={() => setGuideOpen(false)}>Entendido</button></div>
    </dialog>
  </>;
}
