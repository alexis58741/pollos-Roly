'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Check, CircleAlert, Clock3, LoaderCircle, LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ConfirmSignOutForm from './ConfirmSignOutForm';
import { markAttendance } from '../app/asistencia/actions';

const prompts = ['Mira de frente a la cámara', 'Gira la cabeza hacia tu derecha', 'Vuelve a mirar de frente'];
const EMBEDDING_SIZE = 1024;

type HumanFace = {
  score: number;
  embedding?: number[];
  rotation?: { angle: { yaw: number } };
};

type HumanInstance = {
  load(): Promise<void>;
  detect(video: HTMLVideoElement): Promise<{ face: HumanFace[] }>;
};

type HumanWindow = Window & {
  Human?: { Human: new (config: object) => HumanInstance };
};

let humanScriptPromise: Promise<new (config: object) => HumanInstance> | null = null;

function loadHumanLibrary(): Promise<new (config: object) => HumanInstance> {
  const browserWindow = window as HumanWindow;
  if (browserWindow.Human?.Human) return Promise.resolve(browserWindow.Human.Human);
  if (!humanScriptPromise) {
    humanScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/models/asistencia/human.js';
      script.async = true;
      script.onload = () => {
        const Human = browserWindow.Human?.Human;
        if (Human) resolve(Human);
        else reject(new Error('No se pudo iniciar la librería de reconocimiento facial.'));
      };
      script.onerror = () => reject(new Error('No se pudo cargar la librería de reconocimiento facial.'));
      document.head.appendChild(script);
    });
  }
  return humanScriptPromise;
}

export default function AttendanceCapture({ name, role, registeredAt, hasTemplate: initialTemplate, setupMissing }: { name: string; role: string; registeredAt: string | null; hasTemplate: boolean; setupMissing: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<HumanInstance | null>(null);
  const frontEmbeddingRef = useRef<number[] | null>(null);
  const frontYawRef = useRef<number | null>(null);
  const [step, setStep] = useState(-1);
  const [hasTemplate, setHasTemplate] = useState(initialTemplate);
  const [consent, setConsent] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(Boolean(registeredAt));
  const [enrolled, setEnrolled] = useState(false);
  const [isPending, startTransition] = useTransition();

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setError('');
    setMessage('');
    frontEmbeddingRef.current = null;
    frontYawRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara en esta conexión. Abre la página en localhost o HTTPS.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      setStep(0);
      setModelReady(false);
      setMessage('Preparando la verificación facial…');
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error('No se encontró la vista de cámara.');
      video.srcObject = stream;
      await video.play();

      const Human = await loadHumanLibrary();
      const human = new Human({
        backend: 'webgl',
        modelBasePath: `${window.location.origin}/models/asistencia/`,
        debug: false,
        warmup: 'none',
        face: {
          enabled: true,
          detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 2, minConfidence: 0.6, skipFrames: 0, skipTime: 0 },
          mesh: { enabled: true, modelPath: 'facemesh.json' },
          description: { enabled: true, modelPath: 'faceres.json', skipFrames: 0, skipTime: 0, minConfidence: 0.6 },
          iris: { enabled: false }, emotion: { enabled: false }, attention: { enabled: false },
          antispoof: { enabled: false }, liveness: { enabled: false }, gear: { enabled: false },
        },
        body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
      });
      humanRef.current = human;
      await human.load();
      setModelReady(true);
      setMessage('');
    } catch (reason) {
      stopCamera();
      setStep(-1);
      setError(reason instanceof Error && reason.message.includes('fetch') ? 'No se pudieron cargar los modelos faciales locales. Recarga la página e inténtalo de nuevo.' : 'No se pudo iniciar la cámara y la verificación facial. Permite el acceso e inténtalo otra vez.');
    }
  }

  async function validatePose() {
    const human = humanRef.current;
    const video = videoRef.current;
    if (!human || !video || !modelReady || checking) return;
    setChecking(true);
    setError('');
    try {
      // Sample several frames so a single noisy landmark estimate does not
      // make a valid head turn fail. Use the median yaw to ignore outliers.
      const readings: { yaw: number; embedding: number[]; score: number }[] = [];
      let sawMultipleFaces = false;
      for (let sample = 0; sample < 3; sample += 1) {
        if (sample > 0) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const result = await human.detect(video);
        if (result.face.length > 1) {
          sawMultipleFaces = true;
          continue;
        }
        const face = result.face[0];
        const descriptor = face?.embedding;
        const yaw = face?.rotation?.angle.yaw;
        if (face && face.score >= 0.6 && descriptor?.length === EMBEDDING_SIZE && Number.isFinite(yaw)) {
          readings.push({ yaw: yaw as number, embedding: descriptor, score: face.score });
        }
      }
      if (readings.length < 2) {
        setMessage(sawMultipleFaces ? 'Debe aparecer una sola persona en la cámara.' : 'No logro mantener el seguimiento del rostro. Centra la cara, mejora la iluminación e inténtalo de nuevo.');
        return;
      }
      readings.sort((a, b) => a.yaw - b.yaw);
      const reading = readings[Math.floor(readings.length / 2)];
      const yaw = reading.yaw;
      const descriptor = reading.embedding;
      const deltaYaw = yaw - (frontYawRef.current ?? yaw);
      const centered = Math.abs(deltaYaw) < 0.15;
      // The second turn is harder for some cameras and face shapes, so give
      // the left turn a slightly lower angle threshold while still requiring
      // it to be in the opposite direction from the first turn.
      const turnThreshold = 0.2;
      const turned = Math.abs(deltaYaw) > turnThreshold;
      if ((step === 0 || step === 2) && !centered) {
        setMessage('Mira directamente al frente y vuelve a intentar.');
        return;
      }
      if (step === 1 && !turned) {
        setMessage('Gira un poco más la cabeza hacia tu derecha.');
        return;
      }
      if (step === 0) {
        frontEmbeddingRef.current = descriptor;
        frontYawRef.current = yaw;
      }
      if (step < 2) {
        setStep(step + 1);
        setMessage('Correcto. Continúa con la siguiente indicación.');
        return;
      }

      const first = frontEmbeddingRef.current || descriptor;
      const averaged = descriptor.map((value, index) => (value + first[index]) / 2);
      setMessage('Rostro verificado. Guardando la asistencia…');
      stopCamera();
      setStep(-1);
      const form = new FormData();
      form.set('descriptor', JSON.stringify(averaged));
      if (consent) form.set('consent', 'accepted');
      startTransition(async () => {
        const response = await markAttendance(form);
        if (response.error) {
          setError(response.error);
          setMessage('');
        } else {
          setSaved(true);
          setEnrolled(Boolean(response.enrolled));
          setHasTemplate(true);
          setMessage('');
          if (role === 'Cajero') router.replace('/cajero');
        }
      });
    } catch {
      setMessage('No se pudo analizar esta imagen. Mantén la cámara estable e inténtalo otra vez.');
    } finally {
      setChecking(false);
    }
  }

  const registeredLabel = registeredAt ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit' }).format(new Date(registeredAt)) : '';

  return <main className="attendance-page">
    <header className="attendance-header"><div className="attendance-brand"><span className="attendance-brand-mark">R</span><span>POLLOS ROLY<small>CONTROL DE ASISTENCIA</small></span></div><ConfirmSignOutForm><button className="button" type="submit"><LogOut size={16}/> Cerrar sesión</button></ConfirmSignOutForm></header>
    <section className="attendance-card">
      <div className="attendance-greeting"><span className="attendance-icon"><UserRound size={25}/></span><p className="eyebrow">ASISTENCIA DEL PERSONAL</p><h1>Hola, {name}</h1><p className="subtitle">{role} · {hasTemplate ? 'Verifica tu rostro para registrar la entrada de hoy.' : 'Registra tu rostro una vez para usarlo al marcar asistencia.'}</p></div>
      {setupMissing && !saved && <div className="attendance-alert"><CircleAlert size={18}/> Falta configurar las tablas biométricas. Ejecuta <code>database/07_asistencia_biometrica.sql</code> en Supabase.</div>}
      {error && <div className="error-banner attendance-error" role="alert"><CircleAlert size={17}/>{error}</div>}
      {saved ? <div className="attendance-done"><span><Check size={27}/></span><h2>{enrolled ? 'Rostro registrado y asistencia marcada' : 'Asistencia registrada'}</h2><p>{enrolled ? 'Tu plantilla facial quedó guardada para las próximas verificaciones.' : 'Tu rostro coincide con la plantilla guardada.'} Entrada de hoy: <strong>{registeredLabel || 'ahora'}</strong>.</p></div> : <>
        <div className="attendance-camera" style={{ display: step >= 0 ? 'block' : 'none' }}><video ref={videoRef} autoPlay muted playsInline aria-label="Vista previa de la cámara"/><div className="attendance-camera-prompt"><span>PASO {step + 1} DE 3</span><strong>{prompts[Math.max(0, step)]}</strong><small>La cámara comprueba el movimiento y compara tu rostro.</small></div></div>
        {message && <p className="attendance-message" role="status">{isPending ? <LoaderCircle className="attendance-spin" size={16}/> : <CircleAlert size={16}/>} {message}</p>}
        {step >= 0 ? <div className="attendance-actions"><button className="button primary" onClick={validatePose} disabled={!modelReady || checking || isPending}>{checking || isPending ? <LoaderCircle className="attendance-spin" size={17}/> : <Check size={17}/>} {checking ? 'Comprobando…' : isPending ? 'Guardando…' : 'Comprobar y continuar'}</button></div> : <div className="attendance-start">
          {!hasTemplate && <label className="attendance-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>Autorizo guardar una plantilla numérica de mi rostro para verificar mi asistencia. No se guardará una foto en cada registro.</span></label>}
          <p><Camera size={19}/> Te pediremos mirar al frente, girar la cabeza a la derecha y volver al frente. La comparación se realiza para tu propia cuenta.</p>
          <button className="button primary" onClick={startCamera} disabled={setupMissing || (!hasTemplate && !consent)}><Camera size={17}/> {hasTemplate ? 'Verificar y marcar asistencia' : 'Registrar rostro y asistencia'}</button>
        </div>}
      </>}
      {saved && <p className="attendance-saved-time"><Clock3 size={15}/> Registro completado hoy · {registeredLabel || 'hora local'}{role === 'Cajero' ? ' · Abriendo caja…' : ''}</p>}
      <p className="attendance-privacy">Se guarda una plantilla numérica de tu rostro con acceso restringido a tu cuenta. No se guarda una foto por cada asistencia; la plantilla solo se usa para compararla al registrar tu entrada.</p>
    </section>
  </main>;
}
