import { useState } from "react";
import { MapView } from "./components/MapView";
import { LookupForm } from "./components/LookupForm";
import { PatientDetail } from "./components/PatientDetail";
import { SchemaEditor } from "./components/SchemaEditor";
import { Feedback } from "./components/Feedback";
import { Login } from "./components/Login";
import { CardanoLogo } from "./components/CardanoLogo";
import { IppMark } from "./components/IppMark";
import { clearSession, loadSession, type Session } from "./session";
import { shortAddress } from "./wallet";
import type { PatientEnvelope } from "./types";

type Section = "pacientes" | "configurar" | "feedback";

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [patient, setPatient] = useState<PatientEnvelope | null>(null);
  const [section, setSection] = useState<Section>("pacientes");

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  function logout() {
    clearSession();
    setSession(null);
    setPatient(null);
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <IppMark size={38} />
          <div>
            <h1>IPP <span className="brand-sub">Pacientes</span></h1>
            <p className="subtitle">
              Mapa anonimizado, búsqueda por RUT + código, y configuración del formulario.
            </p>
          </div>
        </div>
        <div className="session-bar">
          <CardanoLogo size={14} />
          <div className="session-meta">
            <span className="session-user">{session.username}</span>
            <span className="session-wallet" title={session.walletAddress}>
              {shortAddress(session.walletAddress)}
            </span>
          </div>
          <button type="button" className="logout" onClick={logout}>Salir</button>
        </div>
      </header>

      <nav className="top-nav" role="tablist">
        <button
          type="button"
          className={`nav-tab ${section === "pacientes" ? "active" : ""}`}
          onClick={() => setSection("pacientes")}
        >
          Pacientes
        </button>
        <button
          type="button"
          className={`nav-tab ${section === "configurar" ? "active" : ""}`}
          onClick={() => setSection("configurar")}
        >
          Configurar
        </button>
        <button
          type="button"
          className={`nav-tab ${section === "feedback" ? "active" : ""}`}
          onClick={() => setSection("feedback")}
        >
          Feedback
        </button>
      </nav>

      {section === "pacientes" && (
        <div className="grid">
          <MapView />
          <div>
            <LookupForm onResult={setPatient} />
            {patient && (
              <div style={{ marginTop: 16 }}>
                <PatientDetail patient={patient} />
              </div>
            )}
          </div>
        </div>
      )}
      {section === "configurar" && <SchemaEditor />}
      {section === "feedback" && <Feedback />}
    </main>
  );
}
