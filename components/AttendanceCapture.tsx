'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Check, CircleAlert, Clock3, LoaderCircle, UserRound } from 'lucide-react';
import { enrollFaceAndMarkAttendance, markAttendance } from '../app/asistencia/actions';

const prompts = ['Mira de frente a la cámara', 'Gira la cabeza hacia tu derecha', 'Vuelve a mirar de frente'];
const EMBEDDING_SIZE = 1024;
type HumanFace = { score: number; embedding?: number[]; rotation?: { angle: { yaw: number } } };
type HumanInstance = { load(): Promise<void>; detect(video: HTMLVideoElement): Promise<{ face: HumanFace[] }> };
type HumanWindow = Window & { Human?: { Human: new (config: object) => HumanInstance } };
let humanScriptPromise: Promise<new (config: object) => HumanInstance> | null = null;

function loadHumanLibrary(): Promise<new (config: object) => HumanInstance> {
  const browserWindow = window as HumanWindow;
  if (browserWindow.Human?.Human) return Promise.resolve(browserWindow.Human.Human);
  if (!humanScriptPromise) humanScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/models/asistencia/human.js';
    script.async = true;
    script.onload = () => browserWindow.Human?.Human ? resolve(browserWindow.Human.Human) : reject(new Error('No se pudo iniciar el reconocimiento facial.'));
    script.onerror = () => reject(new Error('No se pudo cargar el reconocimiento facial.'));
    document.head.appendChild(script);
  });
  return humanScriptPromise;
}

export default function AttendanceCapture({ enrollmentName, enrollmentRole }: { enrollmentName?: string; enrollmentRole?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<HumanInstance | null>(null);
  const frontEmbeddingRef = useRef<number[] | null>(null);
  const frontYawRef = useRef<number | null>(null);
  const [step, setStep] = useState(-1);
  const [modelReady, setModelReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [consent, setConsent] = useState(false);
  const [employee, setEmployee] = useState<{ name: string; role: string; registeredAt: string; alreadyMarked: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }
  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError(''); setMessage(''); setSaved(false); setEmployee(null);
    frontEmbeddingRef.current = null; frontYawRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite usar la cámara en esta conexión. Abre esta pantalla en localhost o HTTPS.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream; setStep(0); setModelReady(false); setMessage('Preparando la cámara…');
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error('No se encontró la vista de cámara.');
      video.srcObject = stream; await video.play();
      const Human = await loadHumanLibrary();
      const human = new Human({
        backend: 'webgl', modelBasePath: `${window.location.origin}/models/asistencia/`, debug: false, warmup: 'none',
        face: { enabled: true, detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 2, minConfidence: 0.6, skipFrames: 0, skipTime: 0 }, mesh: { enabled: true, modelPath: 'facemesh.json' }, description: { enabled: true, modelPath: 'faceres.json', skipFrames: 0, skipTime: 0, minConfidence: 0.6 }, iris: { enabled: false }, emotion: { enabled: false }, attention: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, gear: { enabled: false } },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
      });
      humanRef.current = human; await human.load(); setModelReady(true); setMessage('');
    } catch (reason) {
      stopCamera(); setStep(-1);
      setError(reason instanceof Error && reason.message.includes('fetch') ? 'No se pudieron cargar los modelos faciales. Recarga la página e inténtalo de nuevo.' : 'No se pudo iniciar la cámara. Permite el acceso e inténtalo otra vez.');
    }
  }

  async function validatePose() {
    const human = humanRef.current; const video = videoRef.current;
    if (!human || !video || !modelReady || checking) return;
    setChecking(true); setError('');
    try {
      const readings: { yaw: number; embedding: number[] }[] = [];
      let sawMultipleFaces = false;
      for (let sample = 0; sample < 3; sample += 1) {
        if (sample > 0) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const result = await human.detect(video);
        if (result.face.length > 1) { sawMultipleFaces = true; continue; }
        const face = result.face[0]; const descriptor = face?.embedding; const yaw = face?.rotation?.angle.yaw;
        if (face && face.score >= 0.6 && descriptor?.length === EMBEDDING_SIZE && Number.isFinite(yaw)) readings.push({ yaw: yaw as number, embedding: descriptor });
      }
      if (readings.length < 2) { setMessage(sawMultipleFaces ? 'Debe aparecer una sola persona en la cámara.' : 'No logro seguir el rostro. Centra la cara, mejora la iluminación e inténtalo de nuevo.'); return; }
      readings.sort((a, b) => a.yaw - b.yaw);
      const reading = readings[Math.floor(readings.length / 2)];
      const deltaYaw = reading.yaw - (frontYawRef.current ?? reading.yaw);
      if ((step === 0 || step === 2) && Math.abs(deltaYaw) >= 0.15) { setMessage('Mira directamente al frente y vuelve a intentar.'); return; }
      if (step === 1 && Math.abs(deltaYaw) <= 0.2) { setMessage('Gira un poco más la cabeza hacia tu derecha.'); return; }
      if (step === 0) { frontEmbeddingRef.current = reading.embedding; frontYawRef.current = reading.yaw; }
      if (step < 2) { setStep(step + 1); setMessage('Correcto. Continúa con la siguiente indicación.'); return; }
      const first = frontEmbeddingRef.current || reading.embedding;
      const averaged = reading.embedding.map((value, index) => (value + first[index]) / 2);
      setMessage(enrollmentName ? 'Rostro verificado. Guardando plantilla y asistencia…' : 'Rostro verificado. Buscando en el personal…'); stopCamera(); setStep(-1);
      const form = new FormData(); form.set('descriptor', JSON.stringify(averaged));
      if (consent) form.set('consent', 'accepted');
      startTransition(async () => {
        const response = enrollmentName ? await enrollFaceAndMarkAttendance(form) : await markAttendance(form);
        if (response.error) { setError(response.error); setMessage(''); }
        else {
          setEmployee({ name: response.name || 'Empleado', role: response.role || 'Personal', registeredAt: response.registeredAt || new Date().toISOString(), alreadyMarked: Boolean(response.alreadyMarked) });
          setSaved(true); setMessage('');
        }
      });
    } catch { setMessage('No se pudo analizar esta imagen. Mantén la cámara estable e inténtalo otra vez.'); }
    finally { setChecking(false); }
  }

  const registeredLabel = employee ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }).format(new Date(employee.registeredAt)) : '';

  return <main className="attendance-page attendance-kiosk">
    <header className="attendance-header"><div className="attendance-brand"><span className="attendance-brand-mark">R</span><span>POLLOS ROLY<small>CONTROL DE ASISTENCIA</small></span></div><span className="kiosk-badge">TABLET DE PERSONAL</span></header>
    <section className="attendance-card kiosk-card">
      <div className="attendance-greeting"><span className="attendance-icon"><UserRound size={28}/></span><p className="eyebrow">MARCA TU ASISTENCIA</p><h1>{saved ? (employee?.alreadyMarked ? 'Asistencia ya registrada' : '¡Asistencia marcada!') : enrollmentName ? `Hola, ${enrollmentName}` : 'Bienvenido al trabajo'}</h1><p className="subtitle">{saved ? 'Registro identificado en el sistema.' : enrollmentName ? `${enrollmentRole} · Registra tu rostro una vez. Después podrás marcar asistencia desde esta tablet sin iniciar sesión.` : 'Colócate frente a la cámara para identificarte y registrar tu hora de entrada.'}</p></div>
      {error && <div className="error-banner attendance-error" role="alert"><CircleAlert size={18}/>{error}</div>}
      {saved && employee ? <div className="attendance-done kiosk-done"><span><Check size={30}/></span><h2>{employee.name}</h2><p>{employee.role} · {employee.alreadyMarked ? 'Ya habías marcado tu entrada hoy a las' : 'Hora de entrada de hoy:'} <strong>{registeredLabel}</strong></p><p className="kiosk-thanks">Gracias. Esta pantalla está lista para la siguiente persona.</p><button className="button primary kiosk-next" onClick={() => { setSaved(false); setEmployee(null); setError(''); }}>Listo · Siguiente persona</button></div> : <>
        <div className="attendance-camera" style={{ display: step >= 0 ? 'block' : 'none' }}><video ref={videoRef} autoPlay muted playsInline aria-label="Vista previa de la cámara"/><div className="attendance-camera-prompt"><span>VERIFICACIÓN {step + 1} DE 3</span><strong>{prompts[Math.max(0, step)]}</strong><small>El sistema compara la plantilla facial registrada.</small></div></div>
        {message && <p className="attendance-message" role="status">{isPending ? <LoaderCircle className="attendance-spin" size={17}/> : <CircleAlert size={17}/>} {message}</p>}
        {step >= 0 ? <div className="attendance-actions"><button className="button primary" onClick={validatePose} disabled={!modelReady || checking || isPending}>{checking || isPending ? <LoaderCircle className="attendance-spin" size={18}/> : <Check size={18}/>} {checking ? 'Verificando…' : isPending ? 'Buscando…' : 'Comprobar y continuar'}</button></div> : <div className="attendance-start kiosk-start">
          {enrollmentName && <label className="attendance-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>Autorizo guardar mi plantilla numérica facial para verificar asistencia. No se guardará una foto por cada marcación.</span></label>}
          <p><Camera size={21}/> {enrollmentName ? 'Completa el primer registro facial con autorización. Las próximas veces bastará con usar esta tablet.' : 'El reconocimiento buscará tu rostro entre el personal activo. No necesitas iniciar sesión para marcar.'}</p><button className="button primary" onClick={startCamera} disabled={Boolean(enrollmentName && !consent)}><Camera size={18}/> {enrollmentName ? 'Registrar rostro y asistencia' : 'Marcar asistencia'}</button></div>}
      </>}
      {saved && <p className="attendance-saved-time"><Clock3 size={16}/> {employee?.alreadyMarked ? 'Registro existente de hoy' : 'Entrada registrada'} · {registeredLabel}</p>}
      <p className="attendance-privacy">Tu plantilla facial se conserva protegida en el sistema. La tablet solo recibe el nombre de la persona identificada y la hora de asistencia.</p>
    </section>
  </main>;
}
