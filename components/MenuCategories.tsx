'use client';
import { useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Search } from 'lucide-react';
import type { Category, Data } from '../lib/data';

export default function MenuCategories({ data, edit, toggle }: { data: Data; edit: (category: Category) => void; toggle: (category: Category) => Promise<boolean> }) {
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const records = (data.categoryRecords || []).filter(c => (archived || c.active) && c.name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));
  function symbol(name: string) {
    const text = name.toLowerCase();
    if (/pollo/.test(text)) return '🍗';
    if (/bebida|jugo|refresco/.test(text)) return '🥤';
    if (/hamburg/.test(text)) return '🍔';
    if (/snack/.test(text)) return '🍿';
    if (/acompañ|porci|arroz/.test(text)) return '🍚';
    return '🍽️';
  }
  return <section id="categories-panel" role="tabpanel" aria-labelledby="categories-tab">
    <div className="category-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Buscar categorías" placeholder="Buscar categorías…" value={query} onChange={e => setQuery(e.target.value)} /></div><label className="checkbox-label"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />Mostrar archivadas</label></div>
    <div className="category-grid">{records.map(c => {
      const count = data.products.filter(p => p.category === c.name).length;
      return <article className="category-card" key={c.id}><span className="category-symbol" aria-hidden="true">{symbol(c.name)}</span><div className="category-info"><h2>{c.name}</h2><p>{count} {count === 1 ? 'producto' : 'productos'}</p><span className={`badge ${c.active ? 'success' : 'neutral'}`}>{c.active ? 'Activa' : 'Archivada'}</span></div><div className="category-actions"><button className="icon-button" aria-label={`Editar categoría ${c.name}`} onClick={() => edit(c)}><Pencil size={17} /></button><button className="icon-button" aria-label={`${c.active ? 'Archivar' : 'Reactivar'} categoría ${c.name}`} disabled={c.active && count > 0} title={c.active && count > 0 ? 'Mueve sus productos a otra categoría antes de archivarla' : c.active ? 'Archivar categoría' : 'Reactivar categoría'} onClick={() => toggle(c)}>{c.active ? <Archive size={17} /> : <ArchiveRestore size={17} />}</button></div></article>;
    })}</div>
    {!records.length && <div className="empty-state">{query ? 'No se encontraron categorías con ese nombre.' : 'Todavía no hay categorías para mostrar. Usa Agregar categoría para crear una.'}</div>}
    <p className="footnote">Las categorías son comunes a todas las sucursales. Puedes archivar las que no tengan productos y reactivarlas cuando las necesites.</p>
  </section>;
}
