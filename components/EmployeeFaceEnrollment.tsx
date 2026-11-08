'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, X } from 'lucide-react';

type Face = { score: number; embedding?: number[]; rotation?: { angle: { yaw: number } } };
type Human = { load(): Promise<void>; detect(video: HTMLVideoElement): Promise<{ face: Face[] }> };
type HumanWin = Window & { Human?: { Human: new (config: object) => Human } };
let library: Promise<new (config: object) => Human> | null = null;
const steps = ['Mira al frente', 'Gira la cabeza hacia tu derecha', 'Vuelve al frente'];

function loadHuman() {
  const browser = window as HumanWin;
  if (browser.Human?.Human) return Promise.resolve(browser.Human.Human);
  if (!library) library = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/models/asistencia/human.js'; script.async = true;
    script.onload = () => browser.Human?.Human ? resolve(browser.Human.Human) : reject(new Error('No se pudo iniciar el reconocimiento facial.'));
    script.onerror = () => reject(new Error('No se pudo cargar el reconocimiento facial.'));
    document.head.appendChild(script);
  });
  return library;
}

export default function EmployeeFaceEnrollment({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (descriptor: number[], consent: boolean) => Promise<{ ok: boolean; error?: string }> }) {
  const dialog = useRef<HTMLDialogElement>(null); const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const human = useRef<Human | null>(null); const front = useRef<number[] | null>(null); const yaw0 = useRef<number | null>(null);
  const [step, setStep] = useState(-1); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [consent, setConsent] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => { stream.current?.getTracks().forEach(track => track.stop()); dialog.current?.close(); }; }, []);
  async function begin() {
    setError(''); setMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Abre el panel en localhost o HTTPS para permitir la cámara.');
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); setStep(0); setReady(false);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!video.current) throw new Error('No se encontró la cámara.'); video.current.srcObject = stream.current; await video.current.play();
      const HumanCtor = await loadHuman(); const instance = new HumanCtor({ backend: 'webgl', modelBasePath: `${window.location.origin}/models/asistencia/`, debug: false, warmup: 'none', face: { enabled: true, detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 2, minConfidence: .6, skipFrames: 0, skipTime: 0 }, mesh: { enabled: true, modelPath: 'facemesh.json' }, description: { enabled: true, modelPath: 'faceres.json', minConfidence: .6, skipFrames: 0, skipTime: 0 }, iris: { enabled: false }, emotion: { enabled: false }, attention: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, gear: { enabled: false } }, body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false } });
      human.current = instance; await instance.load(); setReady(true);
    } catch (reason) { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setStep(-1); setError(reason instanceof Error ? reason.message : 'No se pudo iniciar la cámara.'); }
  }
  async function captureStep() {
    if (!human.current || !video.current || busy) return; setBusy(true); setError('');
    try {
      const reads: { yaw: number; embedding: number[] }[] = [];
      for (let i=0;i<3;i++) { if (i) await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); const found = await human.current.detect(video.current); if (found.face.length !== 1) continue; const f=found.face[0]; if (f.score >= .6 && f.embedding?.length===1024 && Number.isFinite(f.rotation?.angle.yaw)) reads.push({yaw:f.rotation!.angle.yaw,embedding:f.embedding}); }
      if (reads.length<2) { setError('Centra un solo rostro y mejora la iluminación.'); return; }
      reads.sort((a,b)=>a.yaw-b.yaw); const sample=reads[Math.floor(reads.length/2)]; const delta=sample.yaw-(yaw0.current ?? sample.yaw);
      if ((step===0||step===2)&&Math.abs(delta)>=.15) {setError('Mira directamente al frente.');return;}
      if (step===1&&Math.abs(delta)<=.2) {setError('Gira un poco más la cabeza a tu derecha.');return;}
      if (step===0) {front.current=sample.embedding;yaw0.current=sample.yaw;}
      if (step<2) {setStep(step+1);setError('');return;}
      const base=front.current||sample.embedding; const descriptor=sample.embedding.map((value,index)=>(value+base[index])/2);
      stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setStep(-1);setMessage('Guardando plantilla facial…');
      const result=await onSave(descriptor, consent); if (!result.ok) {setError(result.error||'No se pudo guardar.');setMessage('');} else {setMessage('Rostro registrado. Ya podrá marcar asistencia desde la tablet.');}
    } catch { setError('No se pudo analizar el rostro. Inténtalo otra vez.'); } finally {setBusy(false);}
  }
  return <dialog ref={dialog} className="modal employee-face-modal" onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal-heading"><div><span className="eyebrow">REGISTRO FACIAL</span><h2>Registrar rostro · {name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div><div className="employee-face-body"><label className="attendance-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>Confirmo que el empleado autorizó guardar una plantilla numérica de su rostro para identificarlo al marcar asistencia. No guardaremos fotos de cada marcación.</span></label><div className="employee-face-video" style={{display:step>=0||ready?'block':'none'}}><video ref={video} autoPlay muted playsInline/><div>{step>=0?`PASO ${step+1} DE 3 · ${steps[step]}`:'Cámara activa'}</div></div>{error&&<p className="error-banner" role="alert">{error}</p>}{message&&<p className="success-note" role="status">{message}</p>}{step<0&&!message&&<p>El registro se realiza en este panel de administrador. Luego podrá marcar asistencia desde la tablet sin iniciar sesión.</p>}{step<0&&!message&&<button className="button primary" disabled={!consent} onClick={begin}><Camera size={17}/> Iniciar cámara</button>}{step>=0&&<button className="button primary" disabled={!ready||busy} onClick={captureStep}>{busy?<LoaderCircle className="attendance-spin" size={17}/>:step===2?<Check size={17}/>:<Camera size={17}/>} {busy?'Analizando…':step===2?'Guardar rostro':'Comprobar y continuar'}</button>}{message&&!error&&<button className="button" onClick={onClose}>Cerrar</button>}</div></dialog>;
}
