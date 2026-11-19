/**
 * CONFIGURAÇÃO DO PWA — Antropometria HC II (v2)
 * ----------------------------------------------------------------------------
 * Quando publicar a API paralela (pasta gas-api) e criar o Client ID no Google Cloud,
 * preencha os dois campos abaixo. Enquanto estiverem com o texto padrão, o app
 * permite testar todas as telas em "Modo Demonstração (dados fictícios)".
 */
window.HC2_CONFIG = {
  // URL /exec da implantação do novo projeto Apps Script (pasta gas-api/Code.gs)
  GAS_API_URL: 'https://script.google.com/macros/s/AKfycbyqIz7klFHCk7TouYdaDRbbVqgQErLb6lHf3o62WwAT2HggBlltMV_y__wkj2SPQFhedA/exec',

  // Client ID OAuth 2.0 (tipo "Aplicativo da Web") do Google Cloud Console
  OAUTH_CLIENT_ID: '260165699839-ker1e03hdtnm3291m8g35s9n1div3r82.apps.googleusercontent.com',

  // Desativado em produção: exibe apenas o botão institucional "Entrar com Google"
  ALLOW_DEMO: false,

  APP_VERSION: '2.0.0'
};
