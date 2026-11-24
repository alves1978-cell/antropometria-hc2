# Antropometria HC II — Nutrição Clínica (v2 PWA)

Aplicativo **PWA (Progressive Web App)** mobile-first para avaliação nutricional, acompanhamento antropométrico hospitalar e painel executivo da equipe de Nutrição Clínica do **INCA — Hospital do Câncer II (HC II)**.

> **App em produção:** https://alves1978-cell.github.io/antropometria-hc2/  
> **Repositório GitHub:** https://github.com/alves1978-cell/antropometria-hc2

---

## Como retomar este projeto em qualquer computador (Prompt para IA)

Copie e cole o bloco abaixo no início de uma nova conversa (em qualquer estação de trabalho):

```text
Vamos continuar o projeto "Antropometria HC II (v2 PWA)", um aplicativo web instalável (PWA) de nutrição clínica hospitalar do INCA — HC II.

- Repositório público (frontend PWA): https://github.com/alves1978-cell/antropometria-hc2
- App publicado (GitHub Pages): https://alves1978-cell.github.io/antropometria-hc2/
- Arquitetura: Frontend 100% estático em HTML/CSS/JS puro (zero build / sem Node obrigatório) hospedado no GitHub Pages + Backend API JSON em Google Apps Script ("Antropometria HC II - API v2") conectado à Planilha Google oficial + Login via Google Identity Services (ID Token validado contra a aba USUARIOS da planilha).
- Regras críticas:
  1. LGPD estrita: usar apenas iniciais e matrícula (nunca nome completo).
  2. A Planilha Google é a fonte oficial de cálculos: gravar SOMENTE nas células de entrada (AVAL_IN / PAC_IN) sem alterar fórmulas nem cabeçalhos validados por selfCheck_().
  3. Toda requisição POST do frontend para o Apps Script DEVE usar `Content-Type: text/plain;charset=utf-8` (evita preflight CORS).
  4. Sempre que alterar arquivos estáticos do PWA, incrementar `CACHE_NAME` em `sw.js` para forçar atualização nos celulares.
  5. Manter a identidade visual INCA / Ministério da Saúde (#0C326F, #1351B4, #007A87) e os perfis `editor` e `leitor` (Somente Consulta).
  6. REGRA OBRIGATÓRIA DE DOCUMENTAÇÃO: SEMPRE que atualizarmos o app (frontend PWA ou backend API), atualizar também este `README.md` (funcionalidades, arquivos e a seção "Histórico de versões") e publicar o `README.md` atualizado no GitHub junto com a entrega.

Leia o README.md e os arquivos do repositório acima para pegar o contexto completo. Hoje quero trabalhar no seguinte: [DESCREVA AQUI O QUE DESEJA FAZER].
```

---

## Arquitetura do Sistema

```text
[Celular / PC — PWA no GitHub Pages]
        │  1. Login com Google (Google Identity Services -> ID Token)
        │  2. fetch POST (Content-Type: text/plain;charset=utf-8)
        ▼
[Google Apps Script — Projeto "Antropometria HC II - API v2"]
        │  • Executa como proprietário (USER_DEPLOYING) / Acesso: Qualquer pessoa
        │  • Valida ID Token em oauth2.googleapis.com/tokeninfo (aud + exp + email_verified)
        │  • Confere e-mail ativo ("S") na aba USUARIOS (fail-closed: se vazia, bloqueia)
        │  • Impõe papel `editor` (leitura + escrita) ou `leitor` (somente consulta)
        │  • Usa LockService e grava auditoria com e-mail real do usuário em LOG_APP
        ▼
[Planilha Google Oficial — Banco de Dados & Fórmulas Oficiais]
        • AVALIAÇÕES · PACIENTES · CONTROLE REAVALIAÇÃO · REF_PARAMETROS · USUARIOS · LOG_APP
```

### Por que esta arquitetura?
* **Custo zero (R$ 0/mês):** GitHub Pages + Google Apps Script + Google Sheets + Google OAuth (em produção).
* **Zero barras externas:** elimina a faixa de aviso do Google Apps Script e banners de hospedagem.
* **Instalável no iPhone e Android:** ícone exclusivo `HC II`, abertura em tela cheia e *Service Worker* para carregamento instantâneo.
* **Sem dependência de máquina pessoal:** código frontend 100% em HTML/CSS/JS puro no GitHub (sem etapa de build/compilação).

---

## Estrutura dos Arquivos (Frontend PWA)

| Arquivo | Função |
| :--- | :--- |
| `index.html` | Estrutura das 5 abas (`Hoje`, `Avaliar`, `Pacientes`, `Histórico`, `Painel`) e tela de login institucional Google. |
| `styles.css` | Identidade visual **INCA / Ministério da Saúde** (`#0C326F`, `#1351B4`, `#007A87`), semântica clínica isolada, chips pastéis de setores, *skeleton loading* e layout mobile/desktop responsivo. |
| `config.js` | Configuração pública de conexão (`GAS_API_URL`, `OAUTH_CLIENT_ID`, `ALLOW_DEMO: false`, `APP_VERSION`). |
| `api.js` | Autenticação via Google Identity Services (GIS), envio CORS-safe (`text/plain`), renovação de sessão e base de demonstração opcional. |
| `app.js` | Lógica das abas `Hoje`, `Avaliar`, `Pacientes`, `Histórico`, modais, prévia ao vivo (`IMC`, `%PP`, `Chumlea`, `SARC-F`), gráfico sparkline de evolução ponderal, cópia de evolução para prontuário (`PEP`) e modal `Exportar`. |
| `dashboard.js` | `Painel Nutricional — HC II` com alternância *Todas as avaliações* vs. *1 por paciente (última)*, filtros neutros/ativos, comparativo com período anterior (`▲/▼`), **Matriz 2×2 de Obesidade Sarcopênica**, gráficos SVG semanais com alerta `n < 5` e aderência ao ciclo de 10 dias por setor. |
| `report.js` | Geração client-side de **PDF Executivo INCA/MS** (via `jsPDF`), **PDF Passagem de Plantão / Risco** (Setor → Leito, LGPD) e **Resumo Atual de Internados (`.csv` UTF-8 BOM p/ Excel)**. |
| `manifest.webmanifest` | Manifesto PWA (nome, tema `#0C326F`, ícones `192`, `512` e `maskable`). |
| `sw.js` | Service Worker (*network-first* para o app shell com fallback offline; nunca faz cache de chamadas à API/Google). |
| `icons/` | Ícones `icon.svg`, `icon-maskable.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `apple-touch-icon.png`. |
| `.nojekyll` | Desativa processamento Jekyll no GitHub Pages. |

### Backend (Google Apps Script — projeto separado `Antropometria HC II - API v2`)
* Mantém **100% da lógica oficial da v1** (`AVAL_IN`, `PAC_IN`, `selfCheck_()`, `LockService`, `LOG_APP`, `api_exportarXlsx`), acrescido de:
  * `doPost(e)` com validação obrigatória do Google ID Token (`verificarIdToken_`) e cache de 5 min (`CacheService`).
  * `api_batchInit()` — carrega `init + alertas + pacientes` em 1 única requisição HTTP.
  * `api_registrarAlta(mat, dataAltaISO)` — registro rápido de alta diretamente da aba `Hoje`.
  * `api_registrarExportacao(tipo, detalhe)` — registra auditoria de `PDF`, `PDF_PLANTAO` e `CSV_INTERNADOS` em `LOG_APP`.

---

## Funcionalidades Principais (v2)

1. **`Hoje` (Fila de Reavaliações — ciclo de 10 dias):**
   * KPIs clicáveis (`Atrasadas`, `Reavaliar hoje`, `Em até 2 dias`, `Aguardando 1ª aval.`).
   * Busca rápida, filtro por setor (`GINECO`, `TOC`, `ONCO`, `MASSA PÉLVICA`, `GINECO/ONCO`) e ordenação (`Prioridade / Atraso`, `Leito (ronda)`, `Gravidade ponderal`).
   * Etiquetas direcionais de tendência ponderal (`↓`, `↑`, `→`) e botão **`Registrar alta`** rápido.
2. **`Avaliar` (Formulário beira-leito):**
   * Busca por matrícula com faixa resumo da última avaliação e autopreenchimento de estatura/joelho/peso usual.
   * Prévia ao vivo na barra fixa: **IMC (Lipschitz ≥60 / OMS <60)**, **Peso p/ cálculo** (descontos de edema/ascite/amputação), **%PP**, **Chumlea** e escore **SARC-F**.
   * Alertas preventivos suaves (conversão de estatura digitada em `cm` para `m` em 1 clique; alerta de variação de peso `> 15%`) e selo `"Recomendado p/ rastreio"` para idosos (≥60).
3. **`Pacientes` & `Histórico`:**
   * Detalhe do paciente com **mini gráfico SVG (sparkline)** de evolução ponderal e histórico de avaliações clicáveis.
   * Botão **"Copiar evolução (PEP)"** com 1 clique (texto técnico estruturado, LGPD, pronto para colar no prontuário eletrônico).
   * Cadastro padronizado nas 5 categorias oficiais de setor.
4. **`Painel` & `Exportar`:**
   * Alternância **Todas as avaliações** vs. **1 por paciente (última)** + **Matriz 2×2 de Obesidade Sarcopênica** (`IMC × CB/CP`) + comparativo `▲/▼` de período + aderência ao ciclo de 10 dias por setor.
   * 4 exportações: **Relatório Executivo (PDF)**, **Passagem de Plantão (PDF)**, **Resumo de Internados (`.csv` p/ Excel)** e **Planilha Completa (`.xlsx`)**.

---

## Operação & Manutenção (de qualquer computador)

### 1. Gerenciar usuários e versão "Somente Consulta"
Tudo é feito **diretamente na aba `USUARIOS` da Planilha Google** (não precisa mexer no código nem no Google Cloud — o OAuth já está **Em produção**):
* **`editor` | `S`** → acesso completo (equipe de nutricionistas).
* **`leitor` | `S`** → versão **Somente Consulta** (visualização, Painel, cópia PEP e relatórios; toda escrita/exclusão bloqueada na interface e no servidor).
* **`N`** na coluna Ativo → revoga o acesso imediatamente.

### 2. Atualizar o Frontend (PWA) no GitHub Pages
1. Edite ou envie os arquivos atualizados no repositório `alves1978-cell/antropometria-hc2` (branch `main`).
2. **Importante:** sempre incremente `CACHE_NAME` em `sw.js` (ex.: `hc2-antropo-v2.0.2`) para que os celulares baixem a nova versão automaticamente.
3. **Obrigatório:** atualize também este `README.md` (refletindo a mudança e adicionando uma linha no *Histórico de versões* abaixo) e publique-o junto no GitHub.
4. O GitHub Pages publica a atualização em ~1 minuto.

### 3. Atualizar a API (Google Apps Script)
1. Abra o projeto **`Antropometria HC II - API v2`** em `script.google.com`.
2. Faça o ajuste em `Code.gs` e salve.
3. Clique em **Implantar → Gerenciar implantações → ícone de lápis (Editar) → Versão: Nova versão → Implantar**.
   * *Fazendo assim (em vez de "Nova implantação"), a URL `/exec` não muda e você não precisa alterar o `config.js`!*

### 4. Instalar o App no Celular
* **iPhone (Safari):** abrir `https://alves1978-cell.github.io/antropometria-hc2/` → **Compartilhar** → **Adicionar à Tela de Início**.
* **Android (Chrome):** abrir o link → tocar em **"Instalar"** *(ou `⋮` → Adicionar à tela inicial)*.

---

## Histórico de versões

| Data | Versão | Alterações |
| :--- | :--- | :--- |
| 18/11/2026 | `v2.0.1` | Lançamento da v2 PWA no GitHub Pages: tema INCA/MS, ícone exclusivo `HC II`, login Google (em produção) com perfis `editor`/`leitor` via aba `USUARIOS`, API paralela no Apps Script (`api_batchInit`, `api_registrarAlta`), correção do modal de paciente + sparkline, prévia estendida em `Avaliar`, cópia PEP, Matriz 2×2 de Obesidade Sarcopênica, PDF Executivo com Δ, PDF Passagem de Plantão e CSV de Internados. |
| 23/11/2026 | `docs` | Criação do `README.md` de retomada rápida com regra obrigatória de atualização contínua da documentação a cada nova versão do app. |
