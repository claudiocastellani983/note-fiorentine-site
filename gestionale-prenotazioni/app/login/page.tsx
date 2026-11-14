"use client";
import { useActionState } from "react";
import { signInAction } from "./actions";

export default function LoginPage(){
  const [state,action,pending]=useActionState(signInAction,null);
  return <main className="login-wrap"><section className="login-card">
    <div className="brand"><div className="mark">N</div><div><strong>NOTE FIORENTINE</strong><small>Gestionale prenotazioni</small></div></div>
    <h1 style={{fontSize:29,marginTop:30}}>Accesso staff</h1>
    <p className="sub">Area riservata al personale del ristorante.</p>
    <form action={action}>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {state?.error&&<p className="error">{state.error}</p>}
      <button className="btn primary" disabled={pending}>{pending?"Accesso in corso…":"Accedi"}</button>
    </form>
    <p className="footer-note">L'accesso viene creato dall'amministratore. Non è possibile registrarsi liberamente.</p>
  </section></main>;
}