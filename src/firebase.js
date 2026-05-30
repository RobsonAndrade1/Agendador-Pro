// Importando as funções necessárias do SDK do Firebase
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Objeto de configuração que você pegou no console
const firebaseConfig = {
  apiKey: "AIzaSyDRSQ0hMX9S6lJBsSreAjHqp3-M_vgks48",
  authDomain: "agendador-pro-dc88c.firebaseapp.com",
  projectId: "agendador-pro-dc88c",
  storageBucket: "agendador-pro-dc88c.firebasestorage.app",
  messagingSenderId: "127182388260",
  appId: "1:127182388260:web:ee2308f6e1007332282cb1",
  measurementId: "G-WFLC74SN09"
};

// 1. Inicializa o aplicativo Firebase com as suas configurações
const app = initializeApp(firebaseConfig);

// 2. Inicializa o Firestore (Banco de Dados) e o exporta para ser usado no resto do projeto
export const db = getFirestore(app);
export const auth = getAuth(app)