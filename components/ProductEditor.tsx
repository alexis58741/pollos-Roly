'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import type { Product } from '../lib/data';
import { isChickenCategory, MAX_PHOTO_SIZE, pieceOptions, productDetails, productPhotoUrl } from '../lib/products';

type Props = { product?: Product; categories: string[]; saving: boolean; error: string; cancel: () => void; save: (product: Product, photo?: FormData) => Promise<boolean> };

export default function ProductEditor({ product, categories, saving, error, cancel, save }: Props) {
  const [category, setCategory] = useState(product?.category || categories.find(isChickenCategory) || categories[0] || 'Pollos');
  const [onSale, setOnSale] = useState(product?.onSale || false);
  const [pieceType, setPieceType] = useState<Product['pieceType']>(product?.pieceType || 'all');
  const [photoPath, setPhotoPath] = useState(product?.photoPath || '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [localError, setLocalError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const chicken = isChickenCategory(category);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const image = preview || productPhotoUrl(photoPath);
  function removePhoto() { setFile(null); setPhotoPath(''); setLocalError(''); if (fileInput.current) fileInput.current.value = ''; }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setLocalError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const next: Product = { id: product?.id || crypto.randomUUID(), name, category, price: Number(form.get('price')), description: String(form.get('description') || '').trim(), onSale, salePrice: onSale ? Number(form.get('salePrice')) : null, photoPath, sortOrder: Number(form.get('sortOrder')), active: form.get('active') === 'on', requiresChoices: chicken && form.get('requiresChoices') === 'on', pieceType: chicken ? pieceType : 'all' };
    try {
      if (!name) throw new Error('Escribe el nombre del producto.');
      productDetails(next);
    } catch (e) { setLocalError(e instanceof Error ? e.message : 'Revisa el formulario.'); return; }
    const upload = file ? new FormData() : undefined;
    if (file) upload!.set('photo', file);
    await save(next, upload);
  }
  return <form className="product-editor" onSubmit={submit}>
    <fieldset disabled={saving} className="product-fields">
      <div className="form-columns">
        <label>Nombre del producto *<input name="name" autoFocus required maxLength={100} defaultValue={product?.name} placeholder="Ej. Económico 16 Bs" /></label>
        <label>Categoría *<select name="category" value={category} onChange={e => setCategory(e.target.value)}>{[...new Set([...categories, category])].map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label>Descripción<textarea name="description" rows={3} maxLength={2000} defaultValue={product?.description} placeholder={chicken ? 'Ej. Pierna o contra con arroz y papas' : 'Describe el producto'} /></label>
      <div className="product-prices">
        <label>Precio regular (Bs.) *<input name="price" type="number" min="0.01" max="100000" step="0.01" required defaultValue={product?.price} /></label>
        <label>Precio oferta (Bs.)<input name="salePrice" type="number" min="0.01" max="100000" step="0.01" required={onSale} disabled={!onSale} placeholder="N/A" defaultValue={product?.salePrice ?? ''} /></label>
        <label className="offer-check">¿En oferta?<input type="checkbox" name="onSale" checked={onSale} onChange={e => setOnSale(e.target.checked)} /></label>
      </div>
      <div className="product-photo-row">
        <div className="product-photo-field">
          <label htmlFor="product-photo"><ImagePlus size={15} />{chicken ? 'Fotografía del pollo' : 'Fotografía del producto'}</label>
          {image && <div className="product-photo-preview"><img src={image} alt={`Fotografía de ${product?.name || 'nuevo producto'}`} /><button type="button" className="remove-photo" aria-label="Quitar fotografía" onClick={removePhoto}><X size={16} /></button></div>}
          <label className={`photo-upload ${image ? 'has-preview' : ''}`} htmlFor="product-photo"><ImagePlus size={20} /><span>{image ? 'Cambiar fotografía' : 'Seleccionar fotografía'}</span></label>
          <input ref={fileInput} id="product-photo" className="photo-file-input sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar fotografía del producto" onChange={e => {
            const selected = e.target.files?.[0]; if (!selected) return;
            if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > MAX_PHOTO_SIZE) { setLocalError('Selecciona una imagen JPG, PNG o WebP de hasta 5 MB.'); e.target.value = ''; return; }
            setLocalError(''); setFile(selected);
          }} />
          <small>JPG, PNG o WebP · Máximo 5 MB</small>
        </div>
        <label className="product-order">Orden<input name="sortOrder" type="number" required min="1" max="9999" step="1" defaultValue={product?.sortOrder ?? 1} /></label>
      </div>
      <div className={`product-options ${chicken ? '' : 'single-option'}`}>
        <label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={product?.active ?? true} />Producto activo y disponible</label>
        {chicken && <label className="checkbox-label"><input name="requiresChoices" type="checkbox" defaultChecked={product?.requiresChoices ?? true} />Requiere elegir presas/acompañamientos</label>}
      </div>
      {chicken && <fieldset className="piece-selector"><legend>🍗 Tipo de presas asignadas</legend><p>Selecciona qué presas se ofrecen para este producto. Esto no cambiará aunque modifiques el precio.</p><div className="piece-options">{pieceOptions.map(option => <label key={option.value} className={pieceType === option.value ? 'selected' : ''}><input type="radio" name="pieceType" value={option.value} checked={pieceType === option.value} onChange={() => setPieceType(option.value)} /><span aria-hidden="true">{option.icon}</span>{option.label}</label>)}</div></fieldset>}
    </fieldset>
    {(localError || error) && <p className="error-banner" role="alert">{localError || error}</p>}
    <div className="modal-footer"><button type="button" className="button" disabled={saving} onClick={cancel}>Cancelar</button><button className="button primary" type="submit" disabled={saving}><Check size={17} />{saving ? 'Guardando…' : 'Guardar producto'}</button></div>
  </form>;
}
