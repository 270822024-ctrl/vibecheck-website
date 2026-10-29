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

## 4. Publicar em produção (Vercel + Render)

A estrutura do projeto já está pronta para esse modelo de deploy:

- Frontend estático: Vercel
- API FastAPI: Render
- Banco MySQL: provedor externo gerenciado

### Frontend no Vercel
1. Crie um projeto no Vercel.
2. Defina a pasta raiz como `frontend`.
3. Build command:

   ```bash
   npm install && npm run build
   ```

4. Output directory:

   ```bash
   dist
   ```

5. Configure a variável de ambiente:

   ```env
   VITE_API_URL=https://seu-backend.onrender.com
   ```

   O arquivo de exemplo está em `frontend/.env.production.example`.

6. O arquivo `frontend/vercel.json` já inclui fallback para SPA em Vite.

### Backend no Render
1. Crie um Web Service no Render.
2. Conecte este repositório e defina a pasta raiz como `backend`.
3. Build command:

   ```bash
   pip install -r requirements.txt
   ```

4. Start command:

   ```bash
   bash start.sh
   ```

5. Configure as variáveis de ambiente abaixo no painel do Render:

   ```env
   VIBECHECK_DB_ENGINE=mysql
   VIBECHECK_DB_HOST=seu-host-mysql
   VIBECHECK_DB_PORT=3306
   VIBECHECK_DB_NAME=vibecheck
   VIBECHECK_DB_USER=vibecheck_user
   VIBECHECK_DB_PASSWORD=sua_senha_forte
   VIBECHECK_CORS_ORIGINS=https://seu-frontend.vercel.app
   VIBECHECK_FRONTEND_URL=https://seu-frontend.vercel.app
   VIBECHECK_SEED_DEMO_USER=false
   VIBECHECK_RATE_LIMIT=true
   ```

   O arquivo de exemplo está em `backend/.env.production.example`.

6. O blueprint `render.yaml` no raiz do projeto já prepara esse serviço automatizado. Se preferir, use o Render Blueprint apontando para esse arquivo.

### Banco MySQL em produção
- Crie um MySQL gerenciado em um provedor externo (Aiven, Railway, DigitalOcean, PlanetScale etc.).
- Crie o banco `vibecheck` e o usuário `vibecheck_user`.
- Use o esquema em `database/schema.sql` para criar as tabelas iniciais.

### Deploy de exemplo
- Frontend: `https://vibecheck-frontend.vercel.app`
- Backend: `https://vibecheck-api.onrender.com`

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
