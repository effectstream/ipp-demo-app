import { useState } from "react";
import { CardanoLogo } from "./CardanoLogo";
import { saveSession, type Session } from "../session";
import { findAccount, walletForAccount } from "../accounts";

interface Props {
  onLogin: (s: Session) => void;
}

export function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const account = findAccount(username, password);
    if (!account) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    const session: Session = {
      username: account.username,
      walletAddress: walletForAccount(account),
      createdAt: new Date().toISOString(),
    };
    saveSession(session);
    onLogin(session);
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1>IPP</h1>
        <p className="login-subtitle">Pacientes — registro y planificación</p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={4}
            />
          </div>
          <button type="submit" className="primary login-submit">Ingresar</button>
          {error && <p className="error">{error}</p>}
        </form>

        <div className="cardano-note">
          <CardanoLogo size={16} />
          <span>Tu usuario y contraseña crearán una cuenta Cardano</span>
        </div>

        <p className="login-hint">
          Cuentas de demo: <code>user01</code>…<code>user10</code> con contraseñas <code>pass01</code>…<code>pass10</code>.
        </p>
      </div>
    </main>
  );
}
