'use client';

import dynamic from 'next/dynamic';

type AttendanceProps = { enrollmentName?: string; enrollmentRole?: string };

const AttendanceCapture = dynamic<AttendanceProps>(() => import('./AttendanceCapture'), {
  ssr: false,
  loading: () => <main className="attendance-page"><section className="attendance-card"><p className="attendance-message">Cargando el registro de asistencia…</p></section></main>,
});

export default function AttendanceCaptureClient(props: AttendanceProps) {
  return <AttendanceCapture {...props} />;
}
