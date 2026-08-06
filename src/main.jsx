import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './state/auth-context';
import { DashboardProvider } from './state/dashboard-context';
import { isSupabaseConfigured } from './supabaseClient';

const application = isSupabaseConfigured ? (
  <React.StrictMode>
    <AuthProvider>
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </AuthProvider>
  </React.StrictMode>
) : (
  <main className="flex min-h-screen items-center justify-center bg-[#1F1E1D] p-6 text-[#ECEBE8]">
    <section className="w-full max-w-xl border border-[#3A3936] bg-[#2D2C2B] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8C8A85]">Configuração necessária</p>
      <h1 className="mt-3 text-2xl font-semibold">Supabase não configurado</h1>
      <p className="mt-4 text-sm leading-6 text-[#8C8A85]">
        Cadastre as variáveis <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong> no
        ambiente de hospedagem e faça um novo deploy.
      </p>
    </section>
  </main>
);

ReactDOM.createRoot(document.getElementById('root')).render(application);
