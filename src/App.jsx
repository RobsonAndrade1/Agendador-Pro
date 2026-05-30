import React, { useState, useEffect } from 'react'
// --- IMPORTAÇÕES DO FIREBASE ---
import { db, auth } from './firebase'; 
import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, 
  doc, getDoc, setDoc, deleteDoc, onSnapshot, updateDoc, writeBatch 
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { getMessaging, getToken } from "firebase/messaging";

// --- ÍCONES ---
import { 
  Calendar as CalendarIcon, Clock, Scissors, CheckCircle2, ChevronLeft, 
  User, AlertCircle, ChevronRight, LogIn, UserPlus, LogOut, Eye, 
  EyeOff, MessageCircle, Trash2, ShieldCheck, Lock, Bell, UserX, PlusCircle, X, CalendarX, ChevronDown
} from 'lucide-react'

function App() {
  // --- 👑 CONFIGURAÇÕES MESTRE ---
  const EMAIL_SUPER_ADM = import.meta.env.VITE_EMAIL_SUPER_ADM; 
  const VAPID_KEY = import.meta.env.VITE_VAPID_KEY; 

  // --- ESTADOS DE FLUXO ---
  const [etapa, setEtapa] = useState('carregando') 
  const [usuarioLogado, setUsuarioLogado] = useState(null)
  const [modoLogin, setModoLogin] = useState(true) 
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [dadosPerfil, setDadosPerfil] = useState({ nome: '', sobrenome: '', whatsapp: '' })

  // --- ESTADOS DO CLIENTE ---
  const [meusAgendamentos, setMeusAgendamentos] = useState([]); 
  const [listaProsParaCliente, setListaProsParaCliente] = useState([]);
  const [selecao, setSelecao] = useState({ pro: null, proWhats: null, servicos: [], data: null, datasMultiplas: [], horarios: [] })
  const [horariosOcupados, setHorariosOcupados] = useState([]);
  const [datasBloqueadasPro, setDatasBloqueadasPro] = useState([]); 
  const [mostrarAviso, setMostrarAviso] = useState(false)
  const [dataFoco, setDataFoco] = useState(new Date()) 

  // --- ESTADOS DO PROFISSIONAL (DASHBOARD) ---
  const [agendamentosAdmin, setAgendamentosAdmin] = useState([]);
  const [nomeProfissionalLogado, setNomeProfissionalLogado] = useState("");
  const [abaAbertaPro, setAbaAbertaPro] = useState('agendamentos'); 
  const [modalConfirmarExclusao, setModalConfirmarExclusao] = useState({ aberto: false, id: null, titulo: '' });
  
  // --- ESTADOS DO SUPER ADM ---
  const [listaProfissionais, setListaProfissionais] = useState([]); 
  const [mostrarModalNovoPro, setMostrarModalNovoPro] = useState(false);
  const [novoPro, setNovoPro] = useState({ nome: '', email: '', especialidade: '', whatsapp: '' });

  // --- DADOS FIXOS ---
  const listaServicos = ['Corte Simples', 'Barba', 'Sobrancelha', 'Pezinho', 'Manicure', 'Pedicure']

  // --- 🛡️ MONITOR DE LOGIN REFORÇADO E ACESSO DO BARBEIRO ---
  useEffect(() => {
    const monitor = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUsuarioLogado(user);
        if (user.email === EMAIL_SUPER_ADM) {
          ouvirProfissionaisSuperAdm(); 
          setEtapa('super-adm');
          return;
        } 
        
        try {
          const qUser = query(collection(db, "usuarios"), where("email", "==", user.email.toLowerCase()));
          const querySnapUser = await getDocs(qUser);
          let dadosUser = null;

          if (!querySnapUser.empty) {
            const refDoc = querySnapUser.docs[0];
            dadosUser = refDoc.data();
            if (!dadosUser.uid || dadosUser.uid !== user.uid) {
              await updateDoc(doc(db, "usuarios", refDoc.id), { uid: user.uid });
            }
          }

          if (dadosUser && dadosUser.tipo === 'profissional') {
            if (dadosUser.status === 'bloqueado') {
              alert("Acesso bloqueado."); signOut(auth);
            } else {
              setNomeProfissionalLogado(dadosUser.nome);
              ativarNotificacoes(user.uid);
              ouvirAgendamentosPro(dadosUser.nome);
              buscarBloqueiosDeData(dadosUser.nome);
              setEtapa('admin-dashboard');
            }
          } else if (dadosUser) {
            setDadosPerfil(dadosUser);
            ouvirMeusAgendamentos(user.uid); 
            ouvirProfissionaisParaCliente(); 
            setEtapa('home-cliente');
          } else {
            setEtapa('completar-perfil');
          }
        } catch (error) {
          console.error("Erro ao carregar dados do usuário:", error);
          setEtapa('login');
        }
      } else {
        setEtapa('login');
        setUsuarioLogado(null);
      }
    });
    return () => monitor();
  }, []);

  // --- ⚡ FUNÇÕES DE SINCRONIZAÇÃO COMPLETA ---
  const ouvirProfissionaisParaCliente = () => {
    const q = query(collection(db, "usuarios"), where("tipo", "==", "profissional"), where("status", "==", "ativo"));
    return onSnapshot(q, (snap) => {
      const lista = [];
      snap.forEach(doc => lista.push({ id: doc.id, ...doc.data() }));
      setListaProsParaCliente(lista);
    });
  };

  const ouvirProfissionaisSuperAdm = () => {
    const q = query(collection(db, "usuarios"), where("tipo", "==", "profissional"));
    return onSnapshot(q, (snapshot) => {
      const lista = [];
      snapshot.forEach(doc => lista.push({ id: doc.id, ...doc.data() }));
      setListaProfissionais(lista);
    });
  };

  const ouvirAgendamentosPro = (nomePro) => {
    const q = query(collection(db, "agendamentos"), where("profissional", "==", nomePro));
    return onSnapshot(q, (snapshot) => {
      const lista = [];
      const agora = new Date();
      agora.setHours(0, 0, 0, 0); // Zera o tempo para comparar puramente as datas pontuais

      snapshot.forEach(doc => {
        const d = doc.data();
        
        // Conversão das strings "DD/MM/AAAA" para objetos Date válidos
        const [diaB, mesB, anoB] = d.data.split('/').map(Number);
        const dataDoObjeto = new Date(anoB, mesB - 1, diaB);

        if (d.tipo === 'bloqueio_data' || d.tipo === 'bloqueio_horario') {
          // Se a data do bloqueio for hoje ou no futuro, mantém na lista do dashboard
          if (dataDoObjeto >= agora) lista.push({ id: doc.id, ...d });
        } else {
          // Tratamento para agendamentos de clientes com base nas horas
          const hAt = `${new Date().getHours().toString().padStart(2,'0')}:${new Date().getMinutes().toString().padStart(2,'0')}`;
          const dAtStr = new Date().toLocaleDateString('pt-BR');

          if (d.data > dAtStr || (d.data === dAtStr && d.horarios[d.horarios.length-1] >= hAt)) {
            lista.push({ id: doc.id, ...d });
          }
        }
      });
      
      // Ordenação secundária para renderizar os agendamentos pela string de data e depois por hora
      setAgendamentosAdmin(lista.sort((a, b) => {
        const [diaA, mesA, anoA] = a.data.split('/').map(Number);
        const [diaB, mesB, anoB] = b.data.split('/').map(Number);
        const dataA = new Date(anoA, mesA - 1, diaA);
        const dataB = new Date(anoB, mesB - 1, diaB);
        
        if (dataA.getTime() !== dataB.getTime()) {
          return dataA - dataB;
        }
        return a.horarios[0].localeCompare(b.horarios[0]);
      }));
    });
  };

  const ouvirMeusAgendamentos = (uid) => {
    const q = query(collection(db, "agendamentos"), where("clienteId", "==", uid), where("tipo", "==", "agendamento"));
    return onSnapshot(q, (snapshot) => {
      const lista = [];
      const agora = new Date();
      const horaAtStr = `${agora.getHours().toString().padStart(2,'0')}:${agora.getMinutes().toString().padStart(2,'0')}`;
      const dataHojeStr = agora.toLocaleDateString('pt-BR');
      snapshot.forEach(doc => {
        const d = doc.data();
        if (d.data > dataHojeStr || (d.data === dataHojeStr && d.horarios[d.horarios.length-1] >= horaAtStr)) {
          lista.push({ id: doc.id, ...d });
        }
      });
      setMeusAgendamentos(lista.sort((a,b) => a.data.localeCompare(b.data)));
    });
  };

  const buscarBloqueiosDeData = async (nomePro) => {
    const q = query(collection(db, "agendamentos"), where("profissional", "==", nomePro), where("tipo", "==", "bloqueio_data"));
    const snap = await getDocs(q);
    const datas = [];
    snap.forEach(doc => datas.push(doc.data().data));
    setDatasBloqueadasPro(datas);
  };

  // --- 🔒 FUNÇÕES DE BLOQUEIO BARBEIRO ---
  const handleDayOff = async () => {
    const novasDatas = selecao.datasMultiplas.filter(d => !datasBloqueadasPro.includes(d));
    if (novasDatas.length === 0) return alert("Datas já bloqueadas.");
    try {
      const batch = writeBatch(db);
      novasDatas.forEach(data => {
        const docRef = doc(collection(db, "agendamentos"));
        batch.set(docRef, {
          clienteNome: "🚫 DIA BLOQUEADO", tipo: "bloqueio_data", profissional: nomeProfissionalLogado,
          data: data, horarios: ["00:00"], criadoEm: serverTimestamp()
        });
      });
      await batch.commit();
      alert("Day Off aplicado!");
      buscarBloqueiosDeData(nomeProfissionalLogado);
      setSelecao({ pro: null, proWhats: null, servicos: [], data: null, datasMultiplas: [], horarios: [] });
      setEtapa('admin-dashboard');
    } catch (e) { alert("Erro ao aplicar folga."); }
  };

  const bloquearHorariosPro = async () => {
    if (selecao.horarios.length === 0 || !selecao.data) return alert("Selecione data e slots!");
    try {
      await addDoc(collection(db, "agendamentos"), {
        clienteNome: "🚫 BLOQUEIO / HORÁRIO", tipo: "bloqueio_horario", profissional: nomeProfissionalLogado,
        data: selecao.data, horarios: selecao.horarios, criadoEm: serverTimestamp()
      });
      alert("Horários Bloqueados!");
      setSelecao({ pro: null, proWhats: null, servicos: [], data: null, datasMultiplas: [], horarios: [] });
      setEtapa('admin-dashboard');
    } catch (e) { alert("Erro ao bloquear."); }
  };

  const executarExclusao = async () => {
    try {
      await deleteDoc(doc(db, "agendamentos", modalConfirmarExclusao.id));
      setModalConfirmarExclusao({ aberto: false, id: null, titulo: '' });
      buscarBloqueiosDeData(nomeProfissionalLogado);
    } catch (e) { alert("Erro ao excluir."); }
  };

  // --- 🔑 LÓGICA DE AUTENTICAÇÃO REFORÇADA ---
  const handleAuth = async (e) => {
    e.preventDefault();
    const emailTratado = email.trim().toLowerCase();
    try {
      if (modoLogin) {
        try {
          await signInWithEmailAndPassword(auth, emailTratado, senha);
        } catch (loginErr) {
          if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
            const qPro = query(collection(db, "usuarios"), where("email", "==", emailTratado), where("tipo", "==", "profissional"));
            const snap = await getDocs(qPro);
            if (!snap.empty) {
              await createUserWithEmailAndPassword(auth, emailTratado, senha);
            } else {
              alert("Senha/Usuário Incorreto");
            }
          } else {
            alert("Senha/Usuário Incorreto");
          }
        }
      } else {
        await createUserWithEmailAndPassword(auth, emailTratado, senha);
      }
    } catch (err) { 
      if (err.code === 'auth/email-already-in-use') alert("Este e-mail já possui conta.");
      else alert("Erro ao processar. Verifique sua conexão.");
      setSenha(''); 
    }
  };

  const salvarPerfil = async (e) => {
    e.preventDefault();
    const cleanWhats = dadosPerfil.whatsapp.replace(/\D/g, '');
    if (cleanWhats.length < 10) return alert("WhatsApp Inválido!");
    const novo = { nome: dadosPerfil.nome, sobrenome: dadosPerfil.sobrenome, whatsapp: cleanWhats, email: usuarioLogado.email, uid: usuarioLogado.uid, tipo: 'cliente', status: 'ativo', criadoEm: serverTimestamp() };
    await setDoc(doc(db, "usuarios", usuarioLogado.uid), novo);
    setDadosPerfil(novo);
    ouvirMeusAgendamentos(usuarioLogado.uid);
    setEtapa('home-cliente');
  };

  const buscarHorariosOcupados = async (data, pro) => {
    const q = query(collection(db, "agendamentos"), where("profissional", "==", pro), where("data", "==", data));
    const snap = await getDocs(q);
    const ocupados = [];
    snap.forEach(doc => ocupados.push(...doc.data().horarios));
    setHorariosOcupados(ocupados);
  };

  const salvarAgendamento = async () => {
    try {
      await addDoc(collection(db, "agendamentos"), {
        clienteId: usuarioLogado.uid, 
        clienteNome: `${dadosPerfil.nome} ${dadosPerfil.sobrenome}`,
        clienteWhats: dadosPerfil.whatsapp, 
        profissional: selecao.pro, 
        proWhats: selecao.proWhats,
        servicos: selecao.servicos,
        data: selecao.data, 
        horarios: selecao.horarios, 
        tipo: "agendamento",
        criadoEm: serverTimestamp()
      });
      setSelecao({ pro: null, proWhats: null, servicos: [], data: null, datasMultiplas: [], horarios: [] });
      setEtapa('sucesso');
    } catch (e) { alert("Erro ao agendar."); }
  };

  const ativarNotificacoes = async (uid) => {
    try {
      const messaging = getMessaging();
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        const t = await getToken(messaging, { vapidKey: VAPID_KEY });
        await updateDoc(doc(db, "usuarios", uid), { fcmToken: t });
      }
    } catch (e) { console.error("FCM Erro:", e); }
  };

  const mudarMes = (d) => setDataFoco(prev => new Date(prev.getFullYear(), prev.getMonth() + d, 1));
  const gerarDias = (data) => {
    const dias = []; const ano = data.getFullYear(); const mes = data.getMonth();
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pDia = new Date(ano, mes, 1).getDay(); const uDia = new Date(ano, mes + 1, 0).getDate();
    for (let i = 0; i < pDia; i++) dias.push({ vazio: true });
    for (let i = 1; i <= uDia; i++) {
      const d = new Date(ano, mes, i);
      dias.push({ numero: i, full: d.toLocaleDateString('pt-BR'), bloqueado: d < hoje, vazio: false });
    }
    return dias;
  };

  if (etapa === 'carregando') return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-black animate-pulse uppercase tracking-widest italic">Carregando Sistema...</div>

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-sans overflow-hidden">
      
      {/* 🔴 TELA DE LOGIN / CADASTRO */}
      {etapa === 'login' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl animate-in fade-in duration-500 text-white">
          <h2 className="text-3xl font-black mb-6 italic uppercase tracking-tighter">{modoLogin ? "Acessar" : "Criar Conta"}</h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" value={email} placeholder="E-mail" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-blue-500 text-white" onChange={e => setEmail(e.target.value)} />
            <div className="relative">
              <input type={mostrarSenha ? "text" : "password"} value={senha} placeholder="Senha" required className="w-full p-4 pr-12 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-blue-500 font-mono text-white" onChange={e => setSenha(e.target.value)} />
              <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-all">
                {mostrarSenha ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <button type="submit" className="w-full py-5 bg-blue-600 rounded-2xl font-black uppercase shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all text-white">
              {modoLogin ? "Entrar Agora" : "Cadastrar Agora"}
            </button>
          </form>
          <button type="button" onClick={() => { setModoLogin(!modoLogin); setSenha(''); }} className="w-full mt-6 text-xs text-slate-500 font-black uppercase tracking-widest hover:text-white transition-all text-center">
            {modoLogin ? "Novo por aqui? Cadastre-se" : "Já tem conta? Clique para entrar"}
          </button>
        </div>
      )}

      {/* 🔵 COMPLETAR PERFIL CLIENTE */}
      {etapa === 'completar-perfil' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl animate-in zoom-in duration-500 text-center">
          <h2 className="text-2xl font-black mb-2 italic uppercase text-cyan-400">Completar Perfil</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-8">Precisamos dos seus dados para agendamentos</p>
          <form onSubmit={salvarPerfil} className="space-y-4">
            <input type="text" placeholder="Nome" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none text-white" onChange={e => setDadosPerfil({...dadosPerfil, nome: e.target.value})} />
            <input type="text" placeholder="Sobrenome" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none text-white" onChange={e => setDadosPerfil({...dadosPerfil, sobrenome: e.target.value})} />
            <input type="tel" placeholder="WhatsApp (DDD + Número)" required minLength={10} maxLength={11} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-cyan-500 text-white" onChange={e => setDadosPerfil({...dadosPerfil, whatsapp: e.target.value})} />
            <button type="submit" className="w-full py-5 bg-green-600 rounded-2xl font-black uppercase tracking-widest hover:bg-green-500 transition-all shadow-lg text-white">Concluir Cadastro</button>
          </form>
          <button onClick={() => signOut(auth)} className="mt-8 text-slate-500 text-[10px] font-black uppercase hover:text-red-500 transition-all flex items-center justify-center gap-2 mx-auto"><LogOut size={12}/> Sair da Conta</button>
        </div>
      )}

      {/* 👑 SUPER ADM */}
      {etapa === 'super-adm' && (
        <div className="w-full max-w-2xl bg-white/5 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl animate-in fade-in">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black italic uppercase text-yellow-500 flex items-center gap-2"><ShieldCheck size={28}/> Super Adm</h2>
            <div className="flex gap-2">
              <button onClick={() => setMostrarModalNovoPro(true)} className="p-3 bg-green-500/10 text-green-500 rounded-2xl hover:bg-green-500 hover:text-white transition-all"><PlusCircle /></button>
              <button onClick={() => signOut(auth)} className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"><LogOut /></button>
            </div>
          </div>
          <div className="space-y-4">
            {listaProfissionais.map(pro => (
              <div key={pro.id} className="p-5 rounded-[2rem] border border-white/10 bg-white/5 flex items-center justify-between text-white shadow-lg">
                <div>
                  <h4 className="font-black text-sm uppercase">{pro.nome}</h4>
                  <p className="text-[10px] text-slate-500">{pro.email}</p>
                  <p className="text-[10px] text-cyan-400 font-black uppercase mt-1 tracking-widest italic">WhatsApp: {pro.whatsapp}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateDoc(doc(db,"usuarios",pro.id),{status: pro.status==='bloqueado'?'ativo':'bloqueado'})} className="p-2 bg-orange-500/10 text-orange-500 rounded-xl">
                    {pro.status === 'bloqueado' ? <CheckCircle2 size={18}/> : <UserX size={18}/>}
                  </button>
                  <button onClick={() => { if(window.confirm("Excluir profissional?")) deleteDoc(doc(db,"usuarios",pro.id)) }} className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🟢 DASHBOARD PROFISSIONAL (BARBEIRO) */}
      {etapa === 'admin-dashboard' && (
        <div className="w-full max-w-2xl bg-white/5 border border-white/10 p-6 rounded-[3rem] shadow-2xl animate-in slide-in-from-bottom-4 duration-700 text-white">
          <div className="flex justify-between items-center mb-10 text-white">
            <h2 className="text-2xl font-black italic uppercase text-cyan-400">Minha Agenda</h2>
            <div className="flex gap-2">
              <button onClick={async () => { await buscarBloqueiosDeData(nomeProfissionalLogado); setEtapa('calendario-bloqueio'); }} className="p-3 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center gap-2 text-[10px] font-black uppercase hover:bg-orange-400 hover:text-white transition-all"><Lock size={14}/> Bloquear</button>
              <button onClick={() => signOut(auth)} className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 transition-all text-white"><LogOut size={20}/></button>
            </div>
          </div>
          <div className="space-y-6">
            <div className="border-b border-white/10 pb-4">
              <button onClick={() => setAbaAbertaPro(abaAbertaPro === 'agendamentos' ? '' : 'agendamentos')} className="w-full flex items-center justify-between text-left group">
                <span className="font-black uppercase italic text-sm tracking-widest flex items-center gap-3"><Scissors size={18} className="text-blue-400"/> Agendamentos <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full">{agendamentosAdmin.filter(a => !a.tipo || a.tipo === 'agendamento').length}</span></span>
                <ChevronDown size={20} className={`text-slate-500 transition-all ${abaAbertaPro === 'agendamentos' ? 'rotate-180' : ''}`} />
              </button>
              {abaAbertaPro === 'agendamentos' && (
                <div className="mt-6 space-y-4 animate-in slide-in-from-top-2">
                  {agendamentosAdmin.filter(a => !a.tipo || a.tipo === 'agendamento').map(agen => (
                    <div key={agen.id} className="p-5 bg-white/5 border border-white/5 rounded-[2rem] flex items-center justify-between hover:bg-white/10 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">{agen.horarios.map(h => <span key={h} className="bg-cyan-500/20 text-cyan-400 text-[9px] font-black px-2 py-1 rounded-lg text-center">{h}</span>)}</div>
                        <div><h4 className="font-black text-sm text-white uppercase">{agen.clienteNome}</h4><p className="text-[9px] text-slate-500 font-black uppercase italic tracking-wider">{agen.servicos?.join(' + ')}</p><p className="text-[9px] text-blue-400 font-bold">{agen.data}</p></div>
                      </div>
                      <div className="flex gap-2">
                        <a href={`https://wa.me/55${agen.clienteWhats}`} target="_blank" className="p-3 bg-green-500/20 text-green-400 rounded-full hover:bg-green-500 hover:text-white transition-all"><MessageCircle size={20}/></a>
                        <button onClick={() => setModalConfirmarExclusao({aberto: true, id: agen.id, titulo: `o agendamento de ${agen.clienteNome}`})} className="p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all"><Trash2 size={20}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-b border-white/10 pb-4">
              <button onClick={() => setAbaAbertaPro(abaAbertaPro === 'dayoff' ? '' : 'dayoff')} className="w-full flex items-center justify-between text-left group">
                <span className="font-black uppercase italic text-sm tracking-widest flex items-center gap-3"><CalendarX size={18} className="text-red-400"/> Day Off <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full">{agendamentosAdmin.filter(a => a.tipo === 'bloqueio_data').length}</span></span>
                <ChevronDown size={20} className={`text-slate-500 transition-all ${abaAbertaPro === 'dayoff' ? 'rotate-180' : ''}`} />
              </button>
              {abaAbertaPro === 'dayoff' && (
                <div className="mt-6 space-y-4 animate-in slide-in-from-top-2">
                  {agendamentosAdmin.filter(a => a.tipo === 'bloqueio_data').map(agen => (
                    <div key={agen.id} className="p-5 bg-red-500/5 border border-red-500/10 rounded-[2rem] flex items-center justify-between transition-all">
                      <span className="font-black text-sm text-white uppercase tracking-tighter">📅 Folga em: {agen.data}</span>
                      <button onClick={() => setModalConfirmarExclusao({aberto: true, id: agen.id, titulo: `o Day Off de ${agen.data}`})} className="p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all"><Trash2 size={20}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-b border-white/10 pb-4">
              <button onClick={() => setAbaAbertaPro(abaAbertaPro === 'bloqueios' ? '' : 'bloqueios')} className="w-full flex items-center justify-between text-left group">
                <span className="font-black uppercase italic text-sm tracking-widest flex items-center gap-3"><Clock size={18} className="text-red-400"/> Bloqueio / Horário <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full">{agendamentosAdmin.filter(a => a.tipo === 'bloqueio_horario').length}</span></span>
                <ChevronDown size={20} className={`text-slate-500 transition-all ${abaAbertaPro === 'bloqueios' ? 'rotate-180' : ''}`} />
              </button>
              {abaAbertaPro === 'bloqueios' && (
                <div className="mt-6 space-y-4 animate-in slide-in-from-top-2 text-white">
                  {agendamentosAdmin.filter(a => a.tipo === 'bloqueio_horario').map(agen => (
                    <div key={agen.id} className="p-5 bg-red-500/5 border border-red-500/10 rounded-[2rem] flex items-center justify-between transition-all">
                      <div>
                        <p className="text-xs font-black text-white uppercase mb-1">Horários Bloqueados - {agen.data}</p>
                        <div className="flex flex-wrap gap-1">
                          {agen.horarios.map(h => <span key={h} className="bg-red-500/20 text-red-400 text-[9px] font-black px-2 py-0.5 rounded-lg">{h}</span>)}
                        </div>
                      </div>
                      <button onClick={() => setModalConfirmarExclusao({aberto: true, id: agen.id, titulo: `o bloqueio do dia ${agen.data}`})} className="p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all text-white"><Trash2 size={20}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🗓️ GESTÃO DE AGENDA PRO */}
      {etapa === 'calendario-bloqueio' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[3rem] shadow-2xl animate-in zoom-in text-white text-center">
          <button onClick={() => { setEtapa('admin-dashboard'); setSelecao({ pro: null, proWhats: null, servicos: [], data: null, datasMultiplas: [], horarios: [] }); }} className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-white transition-all"><ChevronLeft size={16}/> Voltar</button>
          <h2 className="text-xl font-black mb-6 italic text-orange-400 uppercase tracking-tighter text-center">Gestão de Agenda</h2>
          <div className="flex items-center justify-between mb-6 px-2 text-white">
            <button onClick={() => mudarMes(-1)} className="p-2 hover:bg-white/10 rounded-full text-orange-400 transition-all text-white"><ChevronLeft size={20} /></button>
            <h3 className="text-sm font-black uppercase tracking-widest flex-1">{dataFoco.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
            <button onClick={() => mudarMes(1)} className="p-2 hover:bg-white/10 rounded-full text-orange-400 transition-all text-white"><ChevronRight size={20} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-8">
            {gerarDias(dataFoco).map((dia, index) => {
              const temDayOff = datasBloqueadasPro.includes(dia.full);
              return dia.vazio ? <div key={index} className="p-2" /> : (
                <button key={index} disabled={dia.bloqueado}
                  onClick={() => {
                    const jaSel = selecao.datasMultiplas.includes(dia.full);
                    const novas = jaSel ? selecao.datasMultiplas.filter(d => d !== dia.full) : [...selecao.datasMultiplas, dia.full];
                    setSelecao({...selecao, data: dia.full, datasMultiplas: novas});
                    if (!temDayOff) buscarHorariosOcupados(dia.full, nomeProfissionalLogado);
                  }}
                  className={`p-2 py-4 rounded-xl text-xs font-black transition-all relative overflow-hidden ${
                    dia.bloqueado ? 'opacity-10' : 
                    temDayOff ? 'border-2 border-red-500/40 text-slate-500' : 
                    selecao.datasMultiplas.includes(dia.full) ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 text-center' : 'bg-white/5 border border-white/5 hover:bg-orange-500/20'
                  }`}>
                  {dia.numero}
                  {temDayOff && <div className="absolute top-1 right-1 w-1 h-1 bg-red-500 rounded-full animate-pulse"/>}
                </button>
              )
            })}
          </div>
          <div className="space-y-6">
            {selecao.datasMultiplas.length > 0 && selecao.datasMultiplas.every(d => !datasBloqueadasPro.includes(d)) && (
              <button onClick={handleDayOff} className="w-full py-4 bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-red-600 hover:text-white transition-all shadow-lg shadow-red-500/10">
                <CalendarX size={16}/> Day Off
              </button>
            )}
            {selecao.datasMultiplas.length === 1 && !datasBloqueadasPro.includes(selecao.data) && (
              <div className="animate-in slide-in-from-bottom-2 text-white">
                <p className="text-center text-[10px] text-slate-500 font-bold uppercase mb-4 tracking-widest">— HORÁRIOS BLOQUEADOS ({selecao.data}) —</p>
                <div className="grid grid-cols-4 gap-2 h-40 overflow-y-auto no-scrollbar pr-2 mb-4 text-white">
                  {Array.from({length: 31}, (_, idx) => {
                    const totalMinutos = 480 + (idx * 30);
                    const hStr = `${Math.floor(totalMinutos / 60).toString().padStart(2, '0')}:${(totalMinutos % 60).toString().padStart(2, '0')}`;
                    const ocupado = horariosOcupados.includes(hStr);
                    return <button key={hStr} disabled={ocupado} onClick={()=>setSelecao({...selecao, horarios: selecao.horarios.includes(hStr)?selecao.horarios.filter(x=>x!==hStr):[...selecao.horarios, hStr]})} 
                      className={`p-2 rounded-xl border text-[10px] font-black transition-all ${ocupado ? 'opacity-20 bg-white/5 text-slate-600' : selecao.horarios.includes(hStr) ? 'bg-red-600 border-red-400 shadow-lg shadow-red-500/20 text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-red-500/10'}`}>{hStr}</button>
                  })}
                </div>
                {selecao.horarios.length > 0 && <button onClick={bloquearHorariosPro} className="w-full py-5 bg-red-600 rounded-2xl font-black uppercase shadow-xl hover:bg-red-500 transition-all text-white">Bloquear Horários</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🏠 HOME CLIENTE */}
      {etapa === 'home-cliente' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[3rem] shadow-2xl text-center animate-in fade-in duration-500">
          <h1 className="text-2xl font-black text-cyan-400 mb-8 uppercase italic tracking-tighter">Agendador Pro</h1>
          
          <div className="space-y-4 mb-10 max-h-[50vh] overflow-y-auto pr-2 no-scrollbar">
            {meusAgendamentos.length === 0 ? (
              <div className="py-10">
                <p className="text-slate-500 text-sm italic font-medium text-white">Você ainda não possui horários agendados.</p>
              </div>
            ) : (
              meusAgendamentos.map(agen => {
                const [h, m] = agen.horarios[0].split(':'); 
                const [dia, mes, ano] = agen.data.split('/');
                const dAgen = new Date(ano, mes-1, dia, h, m);
                const diffHoras = (dAgen - new Date()) / (1000 * 60 * 60);

                return (
                  <div key={agen.id} className="bg-white/5 border border-white/10 p-6 rounded-[2rem] text-left relative overflow-hidden shadow-inner group transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all text-white"><CalendarIcon size={40}/></div>
                    <div className="flex flex-col gap-1 text-white">
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest text-white">Barbeiro: {agen.profissional}</p>
                      <p className="text-lg font-bold tracking-tighter text-white">{agen.data} às {agen.horarios[0]}</p>
                      <p className="text-[10px] text-cyan-500 font-bold uppercase italic tracking-wider mb-4">{agen.servicos?.join(' + ')}</p>
                    </div>
                    
                    {diffHoras > 1 ? (
                      <button onClick={async () => { if(window.confirm("Desmarcar este horário?")) { await deleteDoc(doc(db, "agendamentos", agen.id)); } }} 
                        className="w-full py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-500 hover:text-white transition-all text-white">
                        Desmarcar
                      </button>
                    ) : (
                      <a href={`https://wa.me/55${agen.proWhats}?text=Olá%20${agen.profissional},%20preciso%20falar%20sobre%20meu%20agendamento%20no%20dia%20${agen.data}%20às%20${agen.horarios[0]}`} target="_blank"
                        className="block w-full py-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center group-hover:bg-orange-500/20 transition-all text-white"
                      >
                        <p className="text-[9px] text-orange-400 font-bold uppercase flex items-center justify-center gap-1 tracking-widest text-white">
                          <AlertCircle size={10}/> Cancelamento só via WhatsApp
                        </p>
                      </a>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-col gap-3 text-white">
            <button onClick={() => setEtapa('selecao-profissional')} className="w-full py-5 bg-blue-600 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-500 transition-all shadow-blue-500/20 text-white">
              Agendar Novo Horário
            </button>
            <button onClick={() => signOut(auth)} className="mt-4 text-slate-500 text-[10px] font-black uppercase hover:text-red-500 transition-all flex items-center justify-center gap-2 mx-auto"><LogOut size={12}/> Sair da Conta</button>
          </div>
        </div>
      )}

      {/* ✂️ TELA: SELEÇÃO DE BARBEIRO */}
      {etapa === 'selecao-profissional' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[3rem] shadow-2xl animate-in slide-in-from-right-4 duration-500 text-white">
          <div className="flex items-center gap-4 mb-8 text-white">
            <button onClick={() => setEtapa('home-cliente')} className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-cyan-400 transition-all text-white"><ChevronLeft size={16} className="text-cyan-400"/> Voltar</button>
            <h2 className="text-xl font-black uppercase italic tracking-tighter text-right flex-1">Nossos Barbeiros</h2>
          </div>
          <div className="space-y-4">
            {listaProsParaCliente.length === 0 ? (
              <p className="text-center text-slate-500 text-xs font-black py-10 uppercase tracking-widest italic text-white">Nenhum barbeiro disponível no momento.</p>
            ) : (
              listaProsParaCliente.map(pro => (
                <button key={pro.id} onClick={async () => { 
                    setSelecao({ ...selecao, pro: pro.nome, proWhats: pro.whatsapp }); 
                    await buscarBloqueiosDeData(pro.nome); 
                    setEtapa('calendario'); 
                  }} 
                  className="w-full flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-3xl group hover:bg-blue-600/20 transition-all shadow-lg text-white"
                >
                  <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all text-white"><Scissors /></div>
                  <div className="text-left">
                    <div className="font-bold uppercase text-sm">{pro.nome}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{pro.especialidade}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 🗓️ CALENDÁRIO CLIENTE */}
      {etapa === 'calendario' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-right-4 duration-500 text-white text-center">
          <button onClick={()=>setEtapa('selecao-profissional')} className="mb-4 flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-cyan-400 transition-all text-white self-start"><ChevronLeft size={16} className="text-cyan-400"/> Voltar</button>
          
          <div className="flex items-center justify-between mb-8 px-2 text-white">
            <button onClick={()=>mudarMes(-1)} className="p-2 hover:bg-white/10 rounded-full transition-all text-cyan-400"><ChevronLeft size={22}/></button>
            <span className="text-lg font-black uppercase tracking-tighter text-cyan-400 italic">
              {dataFoco.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
            </span>
            <button onClick={()=>mudarMes(1)} className="p-2 hover:bg-white/10 rounded-full transition-all text-cyan-400"><ChevronRight size={22}/></button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gerarDias(dataFoco).map((dia, index) => dia.vazio ? <div key={index} className="p-2" /> : (
              <button key={index} 
                disabled={dia.bloqueado || datasBloqueadasPro.includes(dia.full)} 
                onClick={() => { setSelecao({...selecao, data: dia.full}); buscarHorariosOcupados(dia.full, selecao.pro); setEtapa('servicos'); }} 
                className={`p-2 py-4 rounded-xl text-sm font-black transition-all ${
                  datasBloqueadasPro.includes(dia.full) 
                  ? 'opacity-[0.05] pointer-events-none border-none bg-transparent' 
                  : dia.bloqueado 
                    ? 'opacity-10 cursor-not-allowed text-slate-700' 
                    : 'bg-white/5 border border-white/5 hover:bg-cyan-500 hover:text-white hover:shadow-lg transition-all text-white'
                }`}>
                {dia.numero}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ✂️ SERVIÇOS CLIENTE */}
      {etapa === 'servicos' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-right-4 text-white text-center">
          <button onClick={() => setEtapa('calendario')} className="mb-4 flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-cyan-400 transition-all text-white self-start"><ChevronLeft size={16} className="text-cyan-400"/> Voltar</button>
          
          <h2 className="text-xl font-black uppercase tracking-tighter text-cyan-400 italic mb-8 text-center">Serviços</h2>
          
          <div className="grid grid-cols-2 gap-3 mb-8 text-white">
            {listaServicos.map(s => (
              <button key={s} onClick={() => setSelecao({ ...selecao, servicos: selecao.servicos.includes(s) ? selecao.servicos.filter(i => i !== s) : [...selecao.servicos, s] })} 
                className={`p-5 rounded-2xl border text-xs font-black transition-all ${selecao.servicos.includes(s) ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}>{s}</button>
            ))}
          </div>
          
          <button 
            disabled={selecao.servicos.length === 0} 
            onClick={() => { if (selecao.servicos.length > 1) setMostrarAviso(true); else setEtapa('horario'); }} 
            className="w-full py-5 bg-white/5 border-2 border-white/20 text-white rounded-[1.5rem] font-black uppercase transition-all disabled:opacity-20 hover:bg-white hover:text-slate-950 shadow-xl"
          >
            Pronto ({selecao.servicos.length})
          </button>
        </div>
      )}

      {/* ⏰ HORÁRIO CLIENTE */}
      {etapa === 'horario' && (
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-6 rounded-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-4 text-white text-center">
          <button onClick={() => setEtapa('servicos')} className="mb-4 flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-cyan-400 transition-all text-white self-start"><ChevronLeft size={16} className="text-cyan-400"/> Voltar</button>
          
          <h2 className="text-xl font-black uppercase tracking-tighter text-cyan-400 italic mb-8 text-center">Horários</h2>

          <div className="grid grid-cols-4 gap-2 h-64 overflow-y-auto no-scrollbar pr-2 text-white">
            {Array.from({length:31}, (_, i) => {
              const totalMinutos = 480 + (i * 30);
              const h = `${Math.floor(totalMinutos / 60).toString().padStart(2, '0')}:${(totalMinutos % 60).toString().padStart(2, '0')}`;
              const ocupado = horariosOcupados.includes(h);
              const agora = new Date();
              const [hSlot, mSlot] = h.split(':').map(Number);
              const dataHojeStr = agora.toLocaleDateString('pt-BR');
              const jaPassou = selecao.data === dataHojeStr && (hSlot < agora.getHours() || (hSlot === agora.getHours() && mSlot <= agora.getMinutes()));
              if (jaPassou) return null;
              return <button key={h} disabled={ocupado} onClick={()=>setSelecao({...selecao, horarios: selecao.horarios.includes(h)?selecao.horarios.filter(x=>x!==h):[...selecao.horarios, h].slice(-selecao.servicos.length)})} 
                className={`p-2 rounded-xl border text-[10px] font-black transition-all ${ocupado ? 'opacity-20 cursor-not-allowed border-red-500/30 text-red-200' : selecao.horarios.includes(h) ? 'bg-green-500 border-green-400 shadow-lg text-white' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}>{h}</button>
            })}
          </div>
          {selecao.horarios.length === selecao.servicos.length && <button onClick={salvarAgendamento} className="w-full mt-6 py-5 bg-green-600 rounded-[1.5rem] font-black uppercase shadow-xl animate-pulse hover:shadow-green-500/30 transition-all text-white">Confirmar Tudo</button>}
        </div>
      )}

      {/* ✅ SUCESSO CLIENTE */}
      {etapa === 'sucesso' && (
        <div className="text-center p-10 bg-white/5 border border-white/10 rounded-[3rem] animate-in zoom-in shadow-2xl text-white">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30 shadow-inner text-green-400"><CheckCircle2 size={48} /></div>
          <h2 className="text-3xl font-black mb-4 italic uppercase tracking-tighter text-white">Agendado!</h2>
          <button onClick={() => setEtapa('home-cliente')} 
            className="w-full py-5 bg-blue-600 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-500 transition-all text-white">
            Ir para Home
          </button>
        </div>
      )}

      {/* 🛡️ MODAL NOVO PRO (SUPER ADM) */}
      {mostrarModalNovoPro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-white/20 p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl relative text-center text-white">
            <button onClick={() => setMostrarModalNovoPro(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-all"><X size={24}/></button>
            <h3 className="text-xl font-black uppercase italic text-green-400 mb-6 flex items-center gap-2"><PlusCircle size={20}/> Novo Profissional</h3>
            <form onSubmit={async e=>{ 
              e.preventDefault(); 
              await addDoc(collection(db,"usuarios"),{
                nome:novoPro.nome, 
                email:novoPro.email.toLowerCase(), 
                whatsapp: novoPro.whatsapp.replace(/\D/g, ''),
                especialidade:novoPro.especialidade, 
                tipo:'profissional', 
                status:'ativo', 
                criadoEm:serverTimestamp()
              }); 
              setNovoPro({ nome: '', email: '', especialidade: '', whatsapp: '' });
              setMostrarModalNovoPro(false); 
            }} className="space-y-4">
              <input type="text" placeholder="Nome do Barbeiro" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-green-500 transition-all text-white" onChange={e => setNovoPro({...novoPro, nome: e.target.value})} />
              <input type="email" placeholder="E-mail de Acesso" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-green-500 transition-all text-white" onChange={e => setNovoPro({...novoPro, email: e.target.value})} />
              <input type="tel" placeholder="WhatsApp (DDD + Número)" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-green-500 transition-all text-white" onChange={e => setNovoPro({...novoPro, whatsapp: e.target.value})} />
              <input type="text" placeholder="Especialidade" required className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-green-500 transition-all text-white" onChange={e => setNovoPro({...novoPro, especialidade: e.target.value})} />
              <button type="submit" className="w-full py-5 bg-green-600 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-green-500 transition-all text-white">Salvar Profissional</button>
            </form>
          </div>
        </div>
      )}

      {/* ⚠️ MODAL AVISO TEMPO (CLIENTE) */}
      {mostrarAviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-white/20 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center text-white">
            <Clock className="text-blue-400 mx-auto mb-6" size={40} />
            <h3 className="text-2xl font-bold mb-3 italic tracking-tighter uppercase text-white">Aviso de Tempo</h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium text-white text-center">Selecione <span className="text-white font-bold">{selecao.servicos.length} horários</span> seguidos para seu agendamento.</p>
            <button onClick={() => { setMostrarAviso(false); setEtapa('horario'); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-blue-500 transition-all text-white">Entendido!</button>
          </div>
        </div>
      )}

      {/* 🛡️ MODAL DE SEGURANÇA EXCLUSÃO PRO */}
      {modalConfirmarExclusao.aberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-xs shadow-2xl text-center text-white">
            <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30 text-red-500">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black uppercase italic text-white mb-2 tracking-tighter">Confirmar?</h3>
            <p className="text-slate-400 text-[10px] mb-8 font-bold uppercase tracking-widest text-center leading-relaxed">Deseja apagar <span className="text-white">{modalConfirmarExclusao.titulo}</span>?</p>
            <div className="flex flex-col gap-3">
              <button onClick={executarExclusao} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-500 transition-all shadow-lg shadow-red-600/20">Sim, Confirmar</button>
              <button onClick={() => setModalConfirmarExclusao({aberto: false, id: null, titulo: ''})} className="w-full py-4 bg-white/5 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:text-white transition-all text-center text-white">Não, Cancelar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App