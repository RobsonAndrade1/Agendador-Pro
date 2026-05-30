importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDRSQ0hMX9S6lJBsSreAjHqp3-M_vgks48",
  projectId: "agendador-pro-dc88c",
  messagingSenderId: "127182388260",
  appId: "1:127182388260:web:ee2308f6e1007332282cb1",
});

const messaging = firebase.messaging();

// Lógica para exibir a notificação quando o app estiver em segundo plano
messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png' // Coloque o caminho do seu ícone aqui
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});