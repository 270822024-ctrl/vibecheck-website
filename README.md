# VibeCheck — workspace completo

Projeto organizado para abrir **frontend, backend e banco de dados** na mesma pasta do Visual Studio Code.

## Estrutura

- `frontend/`: React + TypeScript + Vite
- `backend/`: API FastAPI, autenticação e scanner
- `database/schema.sql`: criação do banco e usuário MySQL
- `docker-compose.yml`: opção para subir MySQL 8.4 em Docker
- `.env.example`: exemplo de configuração local (não contém credenciais válidas)

## 1. Preparar o MySQL

Escolha **uma** opção:

### Opção A — MySQL já instalado no Windows
1. Confirme que o serviço MySQL está iniciado (neste computador, o serviço MySQL84 já está rodando).
2. Pare temporariamente a API que está usando SQLite.
3. No terminal do backend, execute o assistente de configuração:

   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   python -m scripts.setup_mysql
   ```

   Quando solicitado, informe o usuário administrador do MySQL (normalmente `root`) e a senha desse usuário. A senha não aparece na tela. Não informe o usuário/senha do Windows nem a senha da aplicação. O assistente cria o banco e um usuário exclusivo com senha aleatória, grava a senha apenas no `.env` local e migra a conta e o histórico SQLite sem alterar a origem.
4. Inicie novamente a API com `uvicorn app.main:create_app --factory --reload`.

   Tabelas VibeCheck já criadas e vazias são reutilizadas. A configuração aborta sem alterar dados se encontrar tabelas desconhecidas ou registros existentes. O assistente pode redefinir a senha do usuário exclusivo `vibecheck_user` para sincronizá-la com o `.env`. Para migração manual de uma instalação já preparada, use `python -m scripts.migrate_sqlite_to_mysql`; ela só aceita tabelas de destino vazias.

### Opção B — Docker
Instale o Docker Desktop, copie `.env.example` para `.env`, altere as senhas e execute `docker compose up -d mysql`.
O banco e o usuário são criados pelo container. Não use as senhas de exemplo fora de um ambiente local.

## 2. Configurar o backend
No terminal do VS Code:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
```

O arquivo `.env` da raiz configura MySQL local e já está ignorado pelo Git. O assistente o atualiza automaticamente. O backend carrega esse arquivo com `python-dotenv`; nunca publique credenciais.

Para rodar temporariamente com SQLite, use `VIBECHECK_DB_ENGINE=sqlite` e `VIBECHECK_DB_PATH=data/vibecheck.db`.

Configure as variáveis no terminal antes de iniciar, por exemplo:

```powershell
$env:VIBECHECK_DB_ENGINE="mysql"
$env:VIBECHECK_DB_HOST="127.0.0.1"
$env:VIBECHECK_DB_PORT="3306"
$env:VIBECHECK_DB_NAME="vibecheck"
$env:VIBECHECK_DB_USER="vibecheck_user"
$env:VIBECHECK_DB_PASSWORD="SUA_SENHA"
$env:VIBECHECK_CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
$env:VIBECHECK_FRONTEND_URL="http://localhost:5173"
uvicorn app.main:create_app --factory --reload
```

A API fica em `http://localhost:8000`; documentação em `http://localhost:8000/docs`.

## 3. Configurar o frontend
Abra um segundo terminal:

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

O frontend abre em `http://localhost:5173`.

**Integração:** quando `VITE_API_URL` está definido em `frontend/.env.local`, os formulários de cadastro/login usam `/api/auth/register` e `/api/auth/login`, e as análises/histórico são enviados para `/api/analyses`, que persiste os dados no banco configurado no backend. Sem `VITE_API_URL`, o frontend usa o modo local no navegador. A recuperação de senha pela tela ainda precisa de uma integração de interface dedicada; a API já oferece os endpoints e exige SMTP para enviar e-mails.

## 4. Publicação e deploy

O frontend está publicado em:

- https://vibecheck-website-ten.vercel.app

Ele está na Vercel Hobby (gratuita), integrado ao backend Render e ao PostgreSQL Neon. A API está em `https://vibecheck-api-u092.onrender.com`; a verificação de saúde fica em `/api/health`. O frontend publicado já usa essa API. As instruções a seguir servem para recriar ou atualizar a configuração do deploy.

### Backend gratuito (Render + Neon PostgreSQL)

O Railway estava com novos cadastros desativados durante a configuração. Para manter a restrição de não gerar cobranças, o plano alternativo é Render Free + Neon Free, usando PostgreSQL. O backend agora aceita esse banco com SSL.

1. Crie um projeto PostgreSQL no plano Free do Neon.
2. Crie um Web Service no Render ligado ao repositório privado, com:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `bash start.sh`
   - Instance Type: `Free`
3. Configure no Render:

   ```env
   VIBECHECK_DB_ENGINE=postgresql
   VIBECHECK_DATABASE_URL=postgresql://USUARIO:SENHA@HOST/BANCO?sslmode=require
   VIBECHECK_CORS_ORIGINS=https://vibecheck-website-ten.vercel.app
   VIBECHECK_FRONTEND_URL=https://vibecheck-website-ten.vercel.app
   VIBECHECK_SEED_DEMO_USER=false
   VIBECHECK_RATE_LIMIT=true
   ```

   `VIBECHECK_DATABASE_URL` é secreta e deve ser cadastrada somente no painel do Render. O Render Blueprint [render.yaml](./render.yaml) já define as variáveis não secretas.

4. O frontend publicado já está configurado com `VITE_API_URL=https://vibecheck-api-u092.onrender.com`. Se criar outro projeto na Vercel ou mudar a URL da API, cadastre o endereço real em **Settings → Environment Variables**:

   ```env
   VITE_API_URL=https://SEU-SERVICO.onrender.com
   ```

   Em seguida, faça um redeploy do frontend. Configure também no Render o domínio real atribuído à Vercel em `VIBECHECK_CORS_ORIGINS` e `VIBECHECK_FRONTEND_URL`. No deploy atual, o domínio é `https://vibecheck-website-ten.vercel.app`.

Os planos gratuitos têm limites: Render pode suspender a API após inatividade e levar cerca de um minuto para acordar; Neon suspende o compute após inatividade e limita compute, armazenamento e transferência. Não habilite upgrades nem cobrança automática sem revisar os preços.

O arquivo [backend/.env.production.example](./backend/.env.production.example) mostra as variáveis do backend. No frontend publicado, `VITE_API_URL` aponta para a API Render.

## 5. Testes
Backend:

```powershell
cd backend
$env:VIBECHECK_DB_ENGINE="sqlite"
$env:VIBECHECK_DB_PATH="data/vibecheck-test.db"
pytest
Remove-Item Env:VIBECHECK_DB_ENGINE
Remove-Item Env:VIBECHECK_DB_PATH
```

Frontend:

```powershell
cd frontend
npm test
npm run build
```

## Segurança
- Não publique arquivos `.env`.
- Não habilite `VIBECHECK_SEED_DEMO_USER` em ambientes expostos.
- Troque todas as senhas de exemplo.
- Use uma conta MySQL exclusiva da aplicação, sem privilégios de administrador.
