'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty-state"><h1>No pudimos cargar el administrador.</h1><p>Comprueba tu conexión y vuelve a intentar.</p><button className="button" onClick={reset}>Reintentar</button></div>; }
