# VibeCheck — frontend

Interface React + TypeScript para análise estática heurística de segurança.
Pode executar a análise localmente no navegador ou usar a API FastAPI quando
`VITE_API_URL` estiver configurada.

A interface usa React + TypeScript + Vite, com Bootstrap 5 para grade e utilitários
responsivos e estilos próprios para identidade visual, animações e componentes.

## Executar localmente

Requisitos: Node.js 20.19+ e npm.

```powershell
npm install
npm run dev
```

Abra o endereço indicado pelo Vite (por padrão `http://localhost:5173`).

## Criar versão de produção

```powershell
npm run build
```

Os arquivos estáticos ficam em `dist/` e podem ser publicados no GitHub Pages ou
em outro host de frontend.

## O que já está disponível

- Analisa trechos colados ou arquivos de código de até 1 MB no navegador para
  visitantes e no backend para contas autenticadas com a API configurada.
- Exibe evidências, linhas, severidade, referência CWE/OWASP, impacto, correção
  recomendada e prevenção.
- Baixa um relatório PDF estilizado, com resumo executivo, ordem sugerida de
  correção, cobertura heurística do OWASP Top 10:2025 e detalhes dos achados.
- Oferece autenticação e histórico por conta via API; no modo local, guarda o
  histórico neste navegador usando `localStorage`.
- Permite testar como visitante sem criar conta: carrega um exemplo de código e
  executa a análise no navegador, mesmo quando a API está configurada.
- Verifica a resposta da API em `/api/health`, exibe conexão, indisponibilidade
  ou estado de verificação e permite tentar novamente pelo indicador do workspace.
- Diferencia explicitamente análise local de análise autenticada pela API; o
  visitante nunca envia o código ao backend.
- A API usa SQLite ou MySQL configurável. O scanner atual tem 19 regras de
  código e uma regra para manifestos de dependências.

## Próximas etapas do produto

Integrações CI/CD com GitHub, GitLab e Bitbucket, análise automática de Pull
Requests, comentários de bot com patches aplicáveis em um clique e expansão
da cobertura de linguagens ainda não estão implementados. A arquitetura atual
é uma API FastAPI; uma evolução para microsserviços também é uma etapa futura.

As metas propostas para o MVP são menos de 15% de falsos positivos e menos de
dois minutos por repositório, com uma janela estimada de quatro a seis meses.
Esses indicadores ainda precisam ser medidos com benchmarks e repositórios
representativos; não são resultados validados da versão atual.

## Limitações e cobertura OWASP

As regras são heurísticas locais, não executam o código e não substituem uma
auditoria, SAST/DAST ou análise de dependências/CVEs. Categorias OWASP dependem
de contexto de aplicação; categoria sem alerta **não** significa aplicação
segura. A interface identifica explicitamente categorias que precisam de
revisão manual, como design inseguro, falhas de autenticação em fluxo,
dependências transitivas e configuração de infraestrutura.

A taxonomia acompanha o [OWASP Top 10:2025](https://top10.owasp.org/2025/). As
regras podem ser validadas e ampliadas usando o
[OWASP Benchmark](https://owasp.org/www-project-benchmark/) e os requisitos
verificáveis do [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/).
Mapear um padrão a uma categoria não significa cobertura completa da categoria.

## Configurar a API

O componente usa a interface `AnalysisService`, definida em
`src/services/analysisService.ts`. Com `VITE_API_URL` configurada, contas
autenticadas usam a API HTTP; visitantes sempre usam o scanner local,
independentemente dessa configuração. Sem a variável, todas as análises são
locais. No modo local, o código não é enviado ao servidor.

Quando a API está configurada, contas autenticadas enviam o trecho ao backend
para análise; o histórico e as evidências dos achados são persistidos pela API.
Visitantes continuam no modo local. Não use código com credenciais reais na
demonstração.
