import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Braces,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FileDown,
  FileSearch,
  Fingerprint,
  GitBranch,
  Gauge,
  History,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  Menu,
  MoveRight,
  ShieldCheck,
  Radar,
  RefreshCw,
  ScanLine,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { owaspCategories } from "./data/owasp";
import {
  analysisService,
  authenticateWithApi,
  checkApiHealth,
  isApiConfigured,
  localAnalysisService,
  logoutFromApi,
} from "./services/analysisService";
import type { Analysis, Finding } from "./types";

type View = "scanner" | "coverage" | "history";
type InputMode = "paste" | "file";
type ApiStatus = "not-configured" | "checking" | "online" | "offline";

const demoSources = {
  python: {
    filename: "app.py",
    source: `import os
import pickle
import subprocess
import hashlib
import yaml
import requests

DEBUG = True
SECRET_KEY = "replace-me-with-a-real-secret"
password = "admin12345"

def find_user(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return db.execute(query)

def calculate(expression):
    return eval(expression)

def ping(host):
    return subprocess.check_output("ping " + host, shell=True)

def restore_session(payload):
    return pickle.loads(payload)

def load_config(raw):
    return yaml.load(raw)

def fetch_url(url):
    return requests.get(url, verify=False)

def download(filename):
    return open(BASE_DIR + filename, "rb")

def hash_password(value):
    return hashlib.md5(value.encode()).hexdigest()
`,
  },
  javascript: {
    filename: "server.js",
    source: `const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { exec } = require("child_process");
const app = express();

const password = "demo-secret-password";
const secret = "replace-this-jwt-secret";

function hashPassword(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

app.get("/users/:id", (req, res) => {
  const query = "SELECT * FROM users WHERE id = " + req.params.id;
  db.query(query);
});

function authenticate(token) {
  return jwt.verify(token, secret);
}

app.post("/convert", (req, res) => {
  exec(\`convert \${req.body.file} output.png\`);
});

const resetToken = Math.random().toString(36);
res.cookie("session", token, { httpOnly: true });
results.innerHTML = new URLSearchParams(location.search).get("q");
`,
  },
};

const scanStages = [
  { title: "Lendo o arquivo", detail: "Preparando o conteúdo no navegador", icon: FileCode2 },
  { title: "Mapeando padrões", detail: "Verificando a base de regras OWASP", icon: Radar },
  { title: "Cruzando evidências", detail: "Organizando severidades e localizações", icon: Fingerprint },
  { title: "Preparando resultado", detail: "Montando recomendações de correção", icon: Sparkles },
];

function severityStyle(severity: Finding["severity"]) {
  if (severity === "Crítica") return "critical";
  if (severity === "Alta") return "high";
  if (severity === "Média") return "medium";
  return "low";
}

function apiStatusLabel(status: ApiStatus) {
  if (status === "checking") return "Verificando API";
  if (status === "online") return "API respondendo";
  if (status === "offline") return "API indisponível";
  return "API não configurada";
}

function findingOccurrences(analysis: Analysis) {
  return analysis.findings.reduce(
    (total, finding) => total + finding.locations.length,
    0,
  );
}

function scoreFor(analysis: Analysis) {
  const weights = { Crítica: 5, Alta: 3, Média: 1.5, Baixa: 0.5 };
  const weighted = analysis.findings.reduce(
    (total, finding) =>
      total + weights[finding.severity] * finding.locations.length,
    0,
  );
  return Math.max(5, Math.round(100 * 0.86 ** weighted));
}

function IconBadge({
  children,
  tone = "violet",
}: {
  children: React.ReactNode;
  tone?: "violet" | "lime" | "red" | "blue";
}) {
  return <span className={`icon-badge tone-${tone}`}>{children}</span>;
}

function Logo() {
  return (
    <a className="brand" href="#inicio" aria-label="VibeCheck início">
      <span className="brand-mark">
        <img src="./vibecheck-icon.svg" alt="" />
      </span>
      <span className="brand-name">
        vibe<span>check</span>
      </span>
    </a>
  );
}

function FindingRow({
  finding,
  filename,
}: {
  finding: Finding;
  filename: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article className={`finding-row ${open ? "is-open" : ""}`}>
      <button
        className="finding-summary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`finding-severity ${severityStyle(finding.severity)}`}>
          {finding.severity === "Crítica" ? <AlertTriangle size={14} /> : <Bug size={14} />}
        </span>
        <span className="finding-summary-copy">
          <strong>{finding.title}</strong>
          <span>
            {finding.owaspId}:2025 <span className="bullet-divider">·</span>{" "}
            {finding.cwe}
          </span>
        </span>
        <span className="finding-location">
          <FileCode2 size={13} />
          {finding.locations.length === 1
            ? `linha ${finding.locations[0]}`
            : `${finding.locations.length} linhas`}
          <ChevronDown className="finding-chevron" size={15} />
        </span>
      </button>
      {open && (
        <div className="finding-expanded">
          <div className="finding-description">
            <span className="detail-label">O QUE ENCONTRAMOS</span>
            <p>{finding.description}</p>
          </div>
          <div className="evidence-list">
            <span className="detail-label">EVIDÊNCIA NO ARQUIVO</span>
            {finding.evidence.map((evidence, index) => (
              <div className="evidence-code" key={`${finding.id}-${finding.locations[index]}`}>
                <span>{String(finding.locations[index]).padStart(3, "0")}</span>
                <code>{evidence || "(linha vazia)"}</code>
              </div>
            ))}
            <p className="evidence-file">{filename}</p>
          </div>
          <div className="finding-action-grid">
            <div className="action-card action-fix">
              <span className="detail-label"><CheckCircle2 size={13} /> COMO CORRIGIR</span>
              <p>{finding.recommendation}</p>
            </div>
            <div className="action-card action-impact">
              <span className="detail-label"><AlertTriangle size={13} /> SE FICAR ASSIM</span>
              <p>{finding.impact}</p>
            </div>
            <div className="action-card action-prevent">
              <span className="detail-label"><ShieldCheck size={13} /> COMO EVITAR DEPOIS</span>
              <p>{finding.prevention}</p>
            </div>
          </div>
          <a
            className="owasp-learn-link"
            href={`https://cwe.mitre.org/data/definitions/${finding.cwe.replace("CWE-", "")}.html`}
            target="_blank"
            rel="noreferrer"
          >
            Saiba mais sobre {finding.cwe} <ArrowUpRight size={13} />
          </a>
        </div>
      )}
    </article>
  );
}

function OwaspPanel({
  findings,
  onBack,
}: {
  findings: Finding[];
  onBack: () => void;
}) {
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    findings.forEach((finding) => {
      counts.set(
        finding.owaspId,
        (counts.get(finding.owaspId) ?? 0) + finding.locations.length,
      );
    });
    return counts;
  }, [findings]);

  return (
    <section className="workspace-card coverage-section">
      <div className="section-heading-row">
        <div>
          <div className="eyebrow">MAPA DE REFERÊNCIA</div>
          <h2>OWASP Top 10 <span className="heading-year">2025</span></h2>
          <p>
            Uma base de orientação, não um certificado de cobertura. Cada categoria
            precisa ser avaliada no contexto do sistema.
          </p>
        </div>
        <button className="btn button-secondary" onClick={onBack} type="button">
          Voltar ao scanner <ArrowRight size={15} />
        </button>
      </div>
      <div className="owasp-grid row row-cols-1 row-cols-md-2 g-2">
        {owaspCategories.map((category) => {
          const count = categoryCounts.get(category.id) ?? 0;
          return (
            <div className="col" key={category.id}>
              <a
                className={`owasp-card h-100 ${count ? "has-findings" : ""}`}
                href={category.url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="owasp-card-top">
                  <span className="owasp-id">{category.id}</span>
                  <span className={`owasp-status ${count ? "flagged" : "review"}`}>
                    {count ? `${count} sinal(is)` : "revisar"}
                  </span>
                </div>
                <h3>{category.title}</h3>
                <p>{category.guidance}</p>
                <span className="owasp-card-bottom">
                  {category.automated ? "Heurísticas + revisão contextual" : "Revisão manual"}
                  <ArrowUpRight size={13} />
                </span>
              </a>
            </div>
          );
        })}
      </div>
      <div className="coverage-footnote">
        <AlertTriangle size={15} />
        “Sem sinal” significa apenas que as regras atuais não encontraram um
        padrão correspondente. Não significa que a aplicação esteja segura.
      </div>
      <div className="source-links">
        <a href="https://top10.owasp.org/2025/" target="_blank" rel="noreferrer">
          OWASP Top 10 oficial <ArrowUpRight size={13} />
        </a>
        <a href="https://owasp.org/www-project-benchmark/" target="_blank" rel="noreferrer">
          OWASP Benchmark <ArrowUpRight size={13} />
        </a>
        <a href="https://owasp.org/www-project-application-security-verification-standard/" target="_blank" rel="noreferrer">
          OWASP ASVS <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}

const faqItems = [
  {
    question: "Meu código fica no navegador ou é enviado para um servidor?",
    answer: (apiConfigured: boolean) =>
      apiConfigured
        ? "Você pode experimentar como visitante: nesse modo, o código é analisado no navegador e não é enviado ao servidor. Ao entrar em uma conta, o trecho é enviado ao backend configurado para análise e o histórico fica associado à conta."
        : "No modo visitante, a análise e o histórico ficam no navegador, mesmo que a API esteja configurada. Para usar a análise no backend, entre em uma conta.",
  },
  {
    question: "O VibeCheck substitui uma revisão manual de segurança?",
    answer: () =>
      "Não. Ele funciona como apoio para triagem, priorização e entendimento dos riscos, mas a validação final deve considerar arquitetura, regras de negócio e contexto real do sistema.",
  },
  {
    question: "Quantas categorias OWASP ele cobre?",
    answer: () =>
      "As heurísticas mapeiam sinais para categorias do OWASP Top 10:2025, mas isso não representa cobertura completa nem conformidade formal. Categorias sem alertas ainda exigem revisão contextual.",
  },
  {
    question: "O VibeCheck já integra com GitHub, GitLab ou Bitbucket?",
    answer: () =>
      "Ainda não. O scanner aceita arquivos enviados ou código colado, e a API já oferece autenticação e histórico. Webhooks, análise automática de Pull Requests e comentários com correções são etapas planejadas, não recursos disponíveis hoje.",
  },
  {
    question: "As metas de desempenho e precisão já foram validadas?",
    answer: () =>
      "Ainda não. Menos de 15% de falsos positivos e menos de dois minutos por repositório são metas propostas para validação com benchmarks. A versão atual usa heurísticas estáticas e não mede esses indicadores.",
  },
];

function MarketingPage({
  onLogin,
  onSignup,
  onGuest,
  apiConfigured,
}: {
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
  apiConfigured: boolean;
}) {
  const [openFaq, setOpenFaq] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="marketing-shell">
      <header className="marketing-nav">
        <Logo />
        <nav aria-label="Navegação principal" className={`marketing-nav-links ${mobileMenuOpen ? "open" : ""}`}>
          <a href="#recursos" onClick={() => setMobileMenuOpen(false)}>Recursos</a>
          <a href="#roadmap" onClick={() => setMobileMenuOpen(false)}>Projeto</a>
          <a href="#como-funciona" onClick={() => setMobileMenuOpen(false)}>Como funciona</a>
          <a href="#cobertura" onClick={() => setMobileMenuOpen(false)}>Cobertura</a>
          <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
        </nav>
        <div className="marketing-nav-actions">
          <button type="button" className="marketing-menu-toggle" aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((value) => !value)}>
            {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
          <button type="button" className="marketing-login" onClick={onLogin}>Entrar</button>
          <button type="button" className="button-primary marketing-cta" onClick={onSignup}>
            Criar conta <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="hero-copy">
            <div className="eyebrow welcome-eyebrow">
              <span className="eyebrow-spark"><Sparkles size={12} /></span>
              SEGURANÇA DE APLICAÇÕES, SEM FRICÇÃO
            </div>
            <h1>Encontre riscos.<br /><span>Entenda como agir.</span></h1>
            <p>
              Analise trechos de código, encontre padrões de risco e receba
              orientações claras para corrigir e prevenir antes de publicar.
            </p>
            <div className="hero-actions">
              <button type="button" className="button-primary" onClick={onGuest}>
                Experimentar sem conta <ArrowRight size={16} />
              </button>
              <button type="button" className="hero-secondary" onClick={onSignup}>
                Criar conta <MoveRight size={15} />
              </button>
            </div>
            <div className="hero-trust">
              <span><LockKeyhole size={14} /> Teste sem conta</span>
              <span><ShieldCheck size={14} /> Código analisado no navegador</span>
            </div>
          </div>
          <div className="hero-art" aria-label="Prévia ilustrativa da análise">
            <div className="hero-art-glow" />
            <div className="hero-art-grid" />
            <div className="hero-scan-window">
              <div className="hero-window-bar">
                <span><i /><i /><i /></span>
                <span>api / users.py</span>
                <span className="hero-live"><i /> SCAN</span>
              </div>
              <div className="hero-code-lines">
                <span><i>12</i> <b>def</b> get_user(user_id):</span>
                <span><i>13</i> &nbsp; query = <em>{'f"SELECT ... {user_id}"'}</em></span>
                <span className="hero-code-alert"><i>14</i> &nbsp; return db.execute(query)</span>
                <span><i>15</i></span>
              </div>
              <div className="hero-finding-float">
                <span className="finding-severity critical"><AlertTriangle size={14} /></span>
                <span><strong>SQL Injection</strong><small>app.py · linha 14</small></span>
                <span className="hero-critical-label">CRÍTICO</span>
              </div>
              <div className="hero-scan-status"><span /> 20 verificações heurísticas <CheckCircle2 size={14} /></div>
            </div>
            <span className="hero-orbit hero-orbit-one" />
            <span className="hero-orbit hero-orbit-two" />
            <span className="hero-art-chip"><ShieldCheck size={14} /> PRÉVIA ILUSTRATIVA</span>
          </div>
          <div className="hero-bottom-note"><span /> MVP EM DESENVOLVIMENTO · ANÁLISE HEURÍSTICA</div>
        </section>

        <section className="marketing-proof" aria-label="Resumo dos recursos atuais">
          <div><strong>20</strong><span>regras heurísticas</span></div>
          <i />
          <div><strong>10</strong><span>categorias no mapa OWASP</span></div>
          <i />
          <div><strong>{apiConfigured ? "API" : "LOCAL"}</strong><span>{apiConfigured ? "backend configurado" : "análise no navegador"}</span></div>
          <i />
          <div><strong>1 MB</strong><span>limite por arquivo</span></div>
        </section>

        <section className="marketing-section" id="recursos">
          <div className="marketing-section-heading">
            <span className="eyebrow">UM FLUXO DE TRABALHO, NÃO SÓ UM ALERTA</span>
            <h2>Da primeira linha ao<br /><span>plano de correção.</span></h2>
            <p>
              Entenda o que chamou atenção, onde está o padrão e quais passos
              considerar antes de publicar.
            </p>
          </div>
          <div className="marketing-feature-grid">
            <article className="marketing-feature feature-purple">
              <span className="feature-icon"><ScanLine size={19} /></span>
              <span className="eyebrow">01 / ANALISAR</span>
              <h3>Uma revisão rápida, no seu navegador.</h3>
              <p>{apiConfigured ? "Teste como visitante no navegador, sem enviar o trecho ao servidor, ou entre na sua conta para analisar pela API configurada." : "Envie um arquivo ou cole código para executar as regras heurísticas no navegador, sem enviar o trecho a um servidor."}</p>
              <div className="feature-decoration"><Code2 size={74} strokeWidth={0.7} /></div>
            </article>
            <article className="marketing-feature feature-red">
              <span className="feature-icon"><Bug size={19} /></span>
              <span className="eyebrow">02 / ENTENDER</span>
              <h3>Veja o contexto, não só a severidade.</h3>
              <p>Explore linhas, evidências, referências CWE/OWASP, impacto potencial e recomendações em texto. Correções automáticas ainda não estão disponíveis.</p>
              <div className="feature-decoration"><Fingerprint size={74} strokeWidth={0.7} /></div>
            </article>
            <article className="marketing-feature feature-lime">
              <span className="feature-icon"><FileDown size={19} /></span>
              <span className="eyebrow">03 / AGIR</span>
              <h3>Leve um relatório para o próximo passo.</h3>
              <p>Exporte os achados para PDF com resumo, prioridades, localizações e dicas para reduzir a recorrência dos mesmos padrões.</p>
              <div className="feature-decoration"><ShieldCheck size={74} strokeWidth={0.7} /></div>
            </article>
          </div>
        </section>

        <section className="marketing-roadmap" id="roadmap">
          <div className="roadmap-heading">
            <span className="eyebrow">OBJETIVO E EVOLUÇÃO DO PRODUTO</span>
            <h2>Da revisão de código<br /><span>ao pipeline de segurança.</span></h2>
            <p>
              A proposta do VibeCheck é detectar riscos em código gerado com IA
              antes que chegue à produção, ajudando equipes ágeis a revisar
              vulnerabilidades sem transformar a segurança em gargalo.
            </p>
          </div>
          <div className="roadmap-columns">
            <article className="roadmap-card roadmap-current">
              <div className="roadmap-card-heading">
                <span className="roadmap-icon"><CheckCircle2 size={17} /></span>
                <div><span className="eyebrow">JÁ DISPONÍVEL</span><h3>Base do protótipo</h3></div>
              </div>
              <ul>
                <li>Scanner heurístico de arquivos e trechos, com limite de 1 MB.</li>
                <li>Achados com linha, evidência, severidade, CWE/OWASP e orientação de correção.</li>
                <li>Mapa OWASP Top 10:2025 e exportação de relatório PDF.</li>
                <li>API FastAPI com autenticação, histórico por conta e suporte configurável a SQLite/MySQL.</li>
              </ul>
              <p className="roadmap-note">Cobertura e precisão variam por linguagem; os resultados exigem revisão humana.</p>
            </article>
            <article className="roadmap-card roadmap-planned">
              <div className="roadmap-card-heading">
                <span className="roadmap-icon"><GitBranch size={17} /></span>
                <div><span className="eyebrow">PRÓXIMAS ETAPAS · PLANEJADAS</span><h3>Automação no fluxo de entrega</h3></div>
              </div>
              <ul>
                <li>Integração por apps/webhooks com GitHub, GitLab e Bitbucket.</li>
                <li>Bot para analisar Pull Requests e comentar nos trechos sinalizados.</li>
                <li>Sugestão de patch revisável e aplicação em um clique.</li>
                <li>Expansão da cobertura de linguagens e evolução para uma arquitetura de microsserviços escalável.</li>
              </ul>
              <p className="roadmap-note">Essas integrações ainda não estão implementadas no protótipo.</p>
            </article>
          </div>
          <div className="roadmap-goals">
            <div className="roadmap-goals-heading">
              <span className="eyebrow">METAS DO MVP · A VALIDAR</span>
              <span>Janela proposta: 4–6 meses, sujeita à definição do início e do escopo.</span>
            </div>
            <div className="roadmap-goal-grid">
              <article><Target size={17} /><strong>&lt; 15%</strong><span>de falsos positivos</span></article>
              <article><Zap size={17} /><strong>&lt; 2 min</strong><span>por repositório analisado</span></article>
              <p>Indicadores ainda não medidos. Será necessário validar com benchmarks, repositórios representativos e revisão humana antes de tratá-los como resultados.</p>
            </div>
          </div>
        </section>

        <section className="marketing-process" id="como-funciona">
          <div className="process-copy">
            <span className="eyebrow">SIMPLES, TRANSPARENTE, LOCAL</span>
            <h2>Segurança com<br /><span>clareza em cada etapa.</span></h2>
            <p>
              O scanner pode operar localmente ou, quando configurado, enviar a
              análise para a API FastAPI. A execução atual é por arquivo ou
              trecho; integração automática com CI/CD continua planejada.
            </p>
            <button type="button" className="text-link" onClick={onSignup}>Experimentar a demonstração <ArrowRight size={14} /></button>
          </div>
          <div className="process-steps">
            <article><span>01</span><div><strong>Escolha o código</strong><p>Envie um arquivo pequeno ou use um dos exemplos incluídos.</p></div><Upload size={17} /></article>
            <article><span>02</span><div><strong>Acompanhe a análise</strong><p>Veja o progresso e os padrões encontrados pelas regras ativas.</p></div><Activity size={17} /></article>
            <article><span>03</span><div><strong>Revise e exporte</strong><p>Investigue os detalhes e gere um relatório PDF local.</p></div><FileDown size={17} /></article>
          </div>
        </section>

        <section className="marketing-owasp" id="cobertura">
          <div>
            <span className="eyebrow">UMA REFERÊNCIA, NÃO UMA PROMESSA</span>
            <h2>Alinhado ao<br /><span>OWASP Top 10:2025.</span></h2>
            <p>
              As regras demonstrativas mapeiam alguns padrões às categorias
              OWASP. O Top 10 é uma orientação de conscientização, não uma
              checklist de conformidade nem cobertura completa.
            </p>
            <a className="text-link" href="https://top10.owasp.org/2025/" target="_blank" rel="noreferrer">
              Consultar fonte oficial <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="marketing-owasp-list">
            {owaspCategories.map((category) => (
              <a href={category.url} target="_blank" rel="noreferrer" key={category.id}>
                <span>{category.id}</span><strong>{category.title}</strong>
                <span className={category.automated ? "map-status" : "map-manual"}>
                  {category.automated ? "heurísticas + contexto" : "revisão manual"}
                </span>
                <ArrowUpRight size={13} />
              </a>
            ))}
          </div>
        </section>

        <section className="marketing-faq" id="faq">
          <div className="marketing-section-heading">
            <span className="eyebrow">PERGUNTAS FREQUENTES</span>
            <h2>O que mais vale saber<br /><span>antes de testar.</span></h2>
            <p>
              As dúvidas mais comuns do protótipo ajudam a entender o alcance,
              a intenção e os limites da experiência de revisão em tempo real.
            </p>
          </div>
          <div className="faq-list">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index;

              return (
                <article className={`faq-item ${isOpen ? "is-open" : ""}`} key={item.question}>
                  <button type="button" className="faq-question" onClick={() => setOpenFaq(isOpen ? -1 : index)}>
                    <span>{item.question}</span>
                    <ChevronDown size={16} />
                  </button>
                  {isOpen && (
                    <div className="faq-answer">
                      <p>{item.answer(apiConfigured)}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="marketing-bottom-cta">
          <div className="cta-decoration"><ShieldCheck size={47} strokeWidth={1.2} /></div>
          <span className="eyebrow">SEU PRÓXIMO COMMIT PODE SER MAIS SEGURO</span>
          <h2>Vamos começar pelo código?</h2>
          <p>Teste a análise de código sem criar uma conta.</p>
          <button type="button" className="button-primary" onClick={onGuest}>Experimentar sem conta <ArrowRight size={15} /></button>
        </section>
      </main>

      <footer className="marketing-footer">
        <Logo />
        <span>Protótipo em evolução · Análise heurística, sem integrações CI/CD</span>
        <a href="https://top10.owasp.org/2025/" target="_blank" rel="noreferrer">OWASP Top 10:2025 <ArrowUpRight size={12} /></a>
      </footer>
    </div>
  );
}

type AuthMode = "login" | "signup" | "reset";

function AuthPage({
  mode,
  onModeChange,
  onAuthenticate,
  onBack,
  apiConfigured,
  apiStatus,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticate: (email: string, password: string, mode: "login" | "signup") => Promise<void>;
  onBack: () => void;
  apiConfigured: boolean;
  apiStatus: ApiStatus;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSignup = mode === "signup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (mode === "reset") {
      setNotice("A recuperação de senha está disponível pela API quando o SMTP estiver configurado.");
      return;
    }
    if (password.length < 8) {
      setError("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    try {
      await onAuthenticate(email.trim(), password, mode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar. Verifique a API.");
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <header className="auth-topbar">
        <Logo />
        <button className="auth-back-link" type="button" onClick={onBack}>
          <ArrowRight size={14} /> Voltar ao início
        </button>
      </header>
      <div className="auth-layout">
        <section className="auth-story">
          <span className="eyebrow"><span className={`online-indicator api-status-dot status-${apiStatus}`} /> AMBIENTE DE DEMONSTRAÇÃO</span>
          <h1>Segurança começa<br />com <span>visibilidade.</span></h1>
          <p>Entre ou crie uma conta para acessar o workspace. Você também pode testar a análise localmente como visitante, sem enviar o código ao servidor.</p>
          <div className="auth-story-list">
            <span><CheckCircle2 size={15} /> Visitante: código analisado no navegador</span>
            <span><CheckCircle2 size={15} /> API: {apiStatusLabel(apiStatus).toLowerCase()}</span>
            <span><CheckCircle2 size={15} /> Login e histórico dependem do backend</span>
          </div>
          <div className="auth-story-visual" aria-hidden="true">
            <div className="story-orbit story-orbit-a" />
            <div className="story-orbit story-orbit-b" />
            <div className="story-shield"><ShieldCheck size={42} /></div>
            <span className="story-node node-a"><LockKeyhole size={13} /></span>
            <span className="story-node node-b"><ScanLine size={13} /></span>
          </div>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-brand"><Logo /><span className={`auth-local-badge status-${apiStatus}`}><i /> {apiConfigured ? apiStatusLabel(apiStatus).toUpperCase() : "MODO LOCAL"}</span></div>
          <div className="auth-card-heading">
            <span className="eyebrow">{mode === "reset" ? "RECUPERAÇÃO DEMONSTRATIVA" : isSignup ? "CRIE UM ACESSO DE TESTE" : "BEM-VINDO DE VOLTA"}</span>
            <h2 id="auth-title">{mode === "reset" ? "Recuperar acesso" : isSignup ? "Vamos começar." : "Entre no workspace."}</h2>
            <p>
              {mode === "reset"
                ? "A recuperação por e-mail depende da configuração de SMTP no backend."
                : apiStatus === "offline"
                  ? "A API está configurada, mas não respondeu. Inicie o backend e tente novamente; você também pode experimentar como visitante."
                  : apiStatus === "checking"
                    ? "Verificando a conexão com a API..."
                    : isSignup
                      ? apiConfigured
                        ? "Crie uma conta na API conectada. Se o e-mail já estiver cadastrado, use a opção Entrar."
                        : "O cadastro exige a API. Inicie o backend e defina VITE_API_URL no frontend/.env.local."
                      : "Entre com o e-mail e a senha usados no cadastro."}
            </p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="auth-email">E-mail</label>
            <div className="auth-input-wrap">
              <Mail size={16} />
              <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" />
            </div>
            {mode !== "reset" && (
              <>
                <div className="auth-label-row">
                  <label htmlFor="auth-password">Senha</label>
                  {!isSignup && <button type="button" onClick={() => { setError(""); setNotice(""); onModeChange("reset"); }}>Esqueceu a senha?</button>}
                </div>
                <div className="auth-input-wrap">
                  <KeyRound size={16} />
                  <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Mínimo de 8 caracteres" : "Digite a senha demonstrativa"} />
                  <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </>
            )}
            {error && <div className="error-notice" role="alert"><AlertTriangle size={15} /> {error}</div>}
            {notice && <div className="auth-notice" role="status"><CheckCircle2 size={15} /> {notice}</div>}
            {mode !== "reset" && apiStatus !== "online" && (
              <div className="api-connection-notice" role="status">
                {apiStatus === "checking"
                  ? "Aguarde a verificação de conexão para entrar ou criar uma conta."
                  : "O login e o cadastro dependem da API. Você ainda pode voltar e testar como visitante."}
              </div>
            )}
            <button className="btn button-primary auth-submit" type="submit" disabled={mode !== "reset" && apiStatus !== "online"}>
              {mode === "reset" ? "Solicitar recuperação" : isSignup ? "Criar conta" : "Entrar"}
              <ArrowRight size={15} />
            </button>
          </form>
          {mode === "login" && (
            <div className="demo-credentials">
              <span className="eyebrow">ACESSO DE DESENVOLVIMENTO</span>
              <span>Crie uma conta na opção “Criar conta”.</span>
              <span>Conta demo disponível somente se habilitada no backend.</span>
            </div>
          )}
          <div className="auth-mode-switch">
            {mode === "reset" ? (
              <button type="button" onClick={() => { setNotice(""); onModeChange("login"); }}>Voltar ao login</button>
            ) : isSignup ? (
              <span>Já tem acesso? <button type="button" onClick={() => { setError(""); onModeChange("login"); }}>Entrar</button></span>
            ) : (
              <span>Novo por aqui? <button type="button" onClick={() => { setError(""); onModeChange("signup"); }}>Criar conta</button></span>
            )}
          </div>
          <div className="auth-disclaimer">
            <LockKeyhole size={13} />
            {apiConfigured
              ? "A senha é enviada à API configurada e armazenada com hash."
              : "A autenticação precisa do backend; não reutilize senhas pessoais."}
          </div>
        </section>
      </div>
      <footer className="auth-footer"><span>VIBECHECK · MVP EM DESENVOLVIMENTO</span><a href="https://top10.owasp.org/2025/" target="_blank" rel="noreferrer">OWASP Top 10:2025 <ArrowUpRight size={12} /></a></footer>
    </main>
  );
}

function App() {
  const [portal, setPortal] = useState<"landing" | "auth" | "workspace">("landing");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [userEmail, setUserEmail] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>(
    () => isApiConfigured() ? "checking" : "not-configured",
  );
  const [apiStatusError, setApiStatusError] = useState("");
  const [view, setView] = useState<View>("scanner");
  const [mode, setMode] = useState<InputMode>("file");
  const [source, setSource] = useState("");
  const [filename, setFilename] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filter, setFilter] = useState("Todas");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [reportError, setReportError] = useState("");
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const currentAnalysisService = guestMode ? localAnalysisService : analysisService;

  const refreshApiStatus = useCallback(async () => {
    if (!isApiConfigured()) {
      setApiStatus("not-configured");
      setApiStatusError("");
      return;
    }

    setApiStatus("checking");
    setApiStatusError("");
    try {
      setApiStatus(await checkApiHealth() ? "online" : "offline");
    } catch (cause) {
      setApiStatus("offline");
      setApiStatusError(
        cause instanceof Error ? cause.message : "Erro inesperado ao verificar a API.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshApiStatus();
    const interval = window.setInterval(() => void refreshApiStatus(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshApiStatus]);

  const reloadHistory = useCallback(async () => {
    try {
      setHistory(await currentAnalysisService.getHistory());
      setHistoryLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o histórico local.",
      );
    }
  }, [currentAnalysisService]);

  useEffect(() => {
    if (portal !== "workspace") return;
    void reloadHistory();
  }, [portal, reloadHistory]);

  useEffect(() => {
    if (portal !== "workspace" || (!sidebarOpen && !sidebarCollapsed)) return;

    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setSidebarCollapsed(false);
      }
    }

    window.addEventListener("keydown", handleMenuKeyDown);
    return () => window.removeEventListener("keydown", handleMenuKeyDown);
  }, [portal, sidebarOpen, sidebarCollapsed]);

  const counts = useMemo(() => {
    if (!analysis) return { critical: 0, high: 0, medium: 0, occurrences: 0 };
    return analysis.findings.reduce(
      (total, finding) => {
        const occurrences = finding.locations.length;
        if (finding.severity === "Crítica") total.critical += occurrences;
        else if (finding.severity === "Alta") total.high += occurrences;
        else total.medium += occurrences;
        total.occurrences += occurrences;
        return total;
      },
      { critical: 0, high: 0, medium: 0, occurrences: 0 },
    );
  }, [analysis]);

  const filteredFindings = useMemo(() => {
    if (!analysis) return [];
    if (filter === "Todas") return analysis.findings;
    return analysis.findings.filter((finding) => finding.severity === filter);
  }, [analysis, filter]);

  function setViewAndClose(nextView: View) {
    setView(nextView);
    setSidebarOpen(false);
    setError("");
  }

  function toggleWorkspaceMenu() {
    if (window.matchMedia("(max-width: 700px)").matches) {
      setSidebarCollapsed(false);
      setSidebarOpen(true);
      return;
    }
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("O arquivo excede o limite de 1 MB. Escolha um arquivo menor.");
      return;
    }
    try {
      setFilename(file.name);
      setSource(await file.text());
      setMode("file");
      setAnalysis(null);
      setError("");
    } catch {
      setError("Não foi possível ler o arquivo. Verifique se ele está em texto UTF-8.");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void loadFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  }

  async function runAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = mode === "file" ? filename : filename || "codigo-colado.txt";
    if (!source.trim()) {
      setError(mode === "file" ? "Escolha um arquivo para iniciar." : "Cole o código que deseja analisar.");
      return;
    }
    if (new Blob([source]).size > 1_000_000) {
      setError("O código excede o limite de 1 MB.");
      return;
    }

    setError("");
    setAnalysis(null);
    setIsScanning(true);
    setStage(0);
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    try {
      await wait(260);
      setStage(1);
      await wait(340);
      setStage(2);
      await wait(300);
      const result = await currentAnalysisService.analyze({ filename: name, source });
      setStage(3);
      await wait(240);
      setAnalysis(result);
      setFilter("Todas");
      await reloadHistory();
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        120,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível analisar este conteúdo.",
      );
      setStage(-1);
    } finally {
      setIsScanning(false);
    }
  }

  function useDemo(which: keyof typeof demoSources) {
    const demo = demoSources[which];
    setFilename(demo.filename);
    setSource(demo.source);
    setMode("paste");
    setAnalysis(null);
    setError("");
    setView("scanner");
    setSidebarOpen(false);
    setSidebarCollapsed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function clearHistory() {
    try {
      await currentAnalysisService.clearHistory();
      setHistory([]);
      setAnalysis(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível limpar o histórico.");
    }
  }

  async function exportReport(item: Analysis) {
    setReportError("");
    setIsDownloadingReport(true);
    try {
      const { downloadSecurityReport } = await import("./services/pdfReport");
      downloadSecurityReport(item);
    } catch (cause) {
      setReportError(
        cause instanceof Error
          ? `Não foi possível gerar o relatório PDF: ${cause.message}`
          : "Não foi possível gerar o relatório PDF.",
      );
    } finally {
      setIsDownloadingReport(false);
    }
  }

  const historyScans = history.length;
  const totalFindings = history.reduce(
    (total, item) => total + findingOccurrences(item),
    0,
  );
  const currentScore = analysis ? scoreFor(analysis) : null;
  const latestScan = history[0];

  function enterGuestMode() {
    const demo = demoSources.python;
    setGuestMode(true);
    setUserEmail("");
    setView("scanner");
    setMode("paste");
    setFilename(demo.filename);
    setSource(demo.source);
    setAnalysis(null);
    setHistory([]);
    setHistoryLoaded(false);
    setError("");
    setReportError("");
    setSidebarOpen(false);
    setSidebarCollapsed(false);
    setPortal("workspace");
  }

  if (portal === "landing") {
    return (
      <MarketingPage
        onLogin={() => { setAuthMode("login"); setPortal("auth"); }}
        onSignup={() => { setAuthMode("signup"); setPortal("auth"); }}
        onGuest={enterGuestMode}
        apiConfigured={isApiConfigured()}
      />
    );
  }

  if (portal === "auth") {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        apiConfigured={isApiConfigured()}
        apiStatus={apiStatus}
        onAuthenticate={async (email, password, mode) => {
          await authenticateWithApi(mode, email, password);
          setGuestMode(false);
          setUserEmail(email);
          setHistory([]);
          setHistoryLoaded(false);
          setPortal("workspace");
          setError("");
        }}
        onBack={() => setPortal("landing")}
      />
    );
  }

  return (
    <div className="app-shell" id="inicio">
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Fechar menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">L</div>
          <div className="workspace-meta">
            <strong>Workspace pessoal</strong>
            <span>Plano de demonstração</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <span className="sidebar-label">WORKSPACE</span>
        <nav className="side-nav" aria-label="Navegação do workspace">
          <button
            type="button"
            className={`side-link ${view === "scanner" ? "active" : ""}`}
            onClick={() => setViewAndClose("scanner")}
          >
            <ScanLine size={17} />
            <span>Scanner</span>
            <span className="nav-shortcut">⌘ 1</span>
          </button>
          <button
            type="button"
            className={`side-link ${view === "coverage" ? "active" : ""}`}
            onClick={() => setViewAndClose("coverage")}
          >
            <Layers3 size={17} />
            <span>Cobertura OWASP</span>
            <span className="nav-count">10</span>
          </button>
          <button
            type="button"
            className={`side-link ${view === "history" ? "active" : ""}`}
            onClick={() => setViewAndClose("history")}
          >
            <History size={17} />
            <span>Histórico</span>
            {historyScans > 0 && <span className="nav-count">{historyScans}</span>}
          </button>
        </nav>

        <span className="sidebar-label sidebar-label-gap">ATALHOS</span>
        <div className="side-nav">
          <button className="side-link" type="button" onClick={() => useDemo("python")}>
            <Code2 size={17} />
            <span>Exemplo Python</span>
            <ArrowDown className="shortcut-arrow" size={13} />
          </button>
          <button className="side-link" type="button" onClick={() => useDemo("javascript")}>
            <Braces size={17} />
            <span>Exemplo JavaScript</span>
            <ArrowDown className="shortcut-arrow" size={13} />
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className={`local-status ${!guestMode && isApiConfigured() ? `connection-${apiStatus}` : "connection-local"}`} title={apiStatusError || undefined}>
            <span className={`online-indicator ${!guestMode && isApiConfigured() ? `connection-dot-${apiStatus}` : "connection-dot-local"}`} />
            <span>
              <strong>{guestMode || !isApiConfigured() ? "Processamento local" : apiStatusLabel(apiStatus)}</strong>
              <small>{guestMode || !isApiConfigured()
                ? "Nenhum código é enviado"
                : apiStatus === "online"
                  ? "Código enviado à API"
                  : apiStatus === "checking"
                    ? "Verificando conexão"
                    : "Análise da conta indisponível"}</small>
            </span>
          </div>
          <button
            type="button"
            className="side-link reference-link"
            onClick={() => setViewAndClose("coverage")}
          >
            <BookOpenCheck size={16} />
            <span>Documentação OWASP</span>
            <ArrowUpRight size={13} />
          </button>
        </div>
      </aside>

      <div className={`main-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Alternar menu de navegação"
              aria-expanded={window.matchMedia("(max-width: 700px)").matches ? sidebarOpen : !sidebarCollapsed}
              onClick={toggleWorkspaceMenu}
            >
              <Menu size={19} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={14} />
            <span className="breadcrumb-current">
              {view === "scanner" ? "Análise de código" : view === "coverage" ? "OWASP Top 10" : "Histórico"}
            </span>
          </div>
          <div className="topbar-end">
            <button
              className={`stack-pill connection-pill ${!guestMode && isApiConfigured() ? `connection-${apiStatus}` : "connection-local"}`}
              type="button"
              onClick={() => void refreshApiStatus()}
              disabled={!isApiConfigured()}
              title={apiStatusError || (isApiConfigured() ? "Clique para verificar novamente" : "O código é analisado localmente")}
              aria-label={guestMode ? "Modo visitante: análise local; código não enviado ao servidor" : apiStatusLabel(apiStatus)}
              aria-live="polite"
            >
              <span />
              {guestMode ? "Visitante · análise local" : isApiConfigured() ? apiStatusLabel(apiStatus) : "Análise local"}
            </button>
            <span className="topbar-divider" />
            <span className="workspace-user-email">{guestMode ? "Visitante" : userEmail}</span>
            <button className="avatar-small logout-avatar" type="button" aria-label={guestMode ? "Sair do modo visitante" : "Sair da conta"} title={guestMode ? "Sair do modo visitante" : "Sair da conta"} onClick={() => { if (!guestMode) logoutFromApi(); setGuestMode(false); setUserEmail(""); setPortal("landing"); }}>
              {guestMode ? "V" : userEmail.slice(0, 1).toUpperCase() || "VC"}
            </button>
          </div>
        </header>

        <main className="main-content">
          {view === "scanner" && (
            <>
              <section className="welcome-row">
                <div className="welcome-copy">
                  <div className="eyebrow welcome-eyebrow">
                    <span className="eyebrow-spark"><Sparkles size={12} /></span>
                    APPLICATION SECURITY WORKSPACE
                  </div>
                  <h1>
                    Código melhor.<br />
                    <span>Menos risco.</span>
                  </h1>
                  <p>
                    Encontre sinais de vulnerabilidade, entenda o impacto e saia
                    daqui com um plano de correção.
                  </p>
                  <div className="welcome-tags">
                    <span><ShieldCheck size={13} /> {guestMode ? "Código não enviado ao servidor" : isApiConfigured() ? apiStatusLabel(apiStatus) : "Análise privada no navegador"}</span>
                    <span><Zap size={13} /> {analysis?.rulesRun ?? 20} verificações heurísticas</span>
                  </div>
                </div>
                <div className="welcome-visual" aria-hidden="true">
                  <div className="visual-orbit orbit-one" />
                  <div className="visual-orbit orbit-two" />
                  <div className="visual-cross cross-a" />
                  <div className="visual-cross cross-b" />
                  <div className="visual-core">
                    <div className="visual-core-inner">
                      <ShieldCheck size={43} strokeWidth={1.3} />
                    </div>
                  </div>
                  <span className="visual-chip chip-a"><LockKeyhole size={13} /> secure</span>
                  <span className="visual-chip chip-b"><Activity size={13} /> scanning</span>
                  <span className="visual-glow" />
                </div>
              </section>
              {guestMode && (
                <div className="guest-mode-note" role="status">
                  <ShieldCheck size={16} />
                  <span><strong>Modo visitante.</strong> Esta análise é local e seu código não é enviado ao backend.</span>
                  <button type="button" onClick={() => { setAuthMode("signup"); setPortal("auth"); }}>Criar conta <ArrowRight size={13} /></button>
                </div>
              )}

              <section className="metric-strip" aria-label="Resumo local">
                <div className="metric-tile">
                  <IconBadge tone="violet"><FileSearch size={17} /></IconBadge>
                  <div><span>ANÁLISES NESTE NAVEGADOR</span><strong>{historyScans}</strong></div>
                  <span className="metric-caption">histórico local</span>
                </div>
                <div className="metric-tile">
                  <IconBadge tone="red"><ShieldAlert size={17} /></IconBadge>
                  <div><span>ACHADOS REGISTRADOS</span><strong>{totalFindings}</strong></div>
                  <span className="metric-caption">todas as análises</span>
                </div>
                <div className="metric-tile">
                  <IconBadge tone="lime"><Gauge size={17} /></IconBadge>
                  <div><span>ÚLTIMO ÍNDICE</span><strong>{latestScan ? scoreFor(latestScan) : "—"}<small>{latestScan ? "/100" : ""}</small></strong></div>
                  <span className="metric-caption">{latestScan ? latestScan.filename : "aguardando primeira análise"}</span>
                </div>
              </section>

              <section className="workspace-grid row g-3 align-items-start">
                <div className="col-12 col-xl-8">
                <div className="workspace-card scan-card">
                  <div className="card-heading">
                    <div>
                      <div className="eyebrow">NOVO SCAN</div>
                      <h2>Vamos dar uma olhada no código?</h2>
                      <p>Escolha um arquivo ou cole o trecho que quer revisar.</p>
                    </div>
                    <span className="privacy-chip"><LockKeyhole size={12} /> {guestMode || !isApiConfigured() ? "ANÁLISE LOCAL" : "ENVIO À API"}</span>
                  </div>

                  <div className="input-tabs" role="tablist" aria-label="Origem do código">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "file"}
                      className={mode === "file" ? "selected" : ""}
                      onClick={() => setMode("file")}
                    >
                      <Upload size={15} /> Enviar arquivo
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "paste"}
                      className={mode === "paste" ? "selected" : ""}
                      onClick={() => setMode("paste")}
                    >
                      <Code2 size={15} /> Colar código
                    </button>
                    <span className="input-limit">LIMITE 1 MB</span>
                  </div>

                  <form onSubmit={runAnalysis}>
                    {mode === "file" ? (
                      <div
                        className={`dropzone ${dragging ? "drag-active" : ""} ${filename ? "file-loaded" : ""}`}
                        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                        onDragOver={(event) => event.preventDefault()}
                        onDragLeave={(event) => {
                          if (event.currentTarget === event.target) setDragging(false);
                        }}
                        onDrop={handleDrop}
                      >
                        <input
                          ref={fileInput}
                          className="file-input-hidden"
                          type="file"
                          accept=".py,.js,.jsx,.ts,.tsx,.json,.txt,.php,.java,.go,.rb,.cs,.c,.cpp,.html,.sql,.yml,.yaml"
                          onChange={handleFileChange}
                          aria-label="Selecionar arquivo de código"
                        />
                        {filename ? (
                          <div className="loaded-file">
                            <div className="loaded-file-icon"><FileCode2 size={21} /></div>
                            <div className="loaded-file-copy">
                              <strong>{filename}</strong>
                              <span>{source.split(/\r?\n/).length.toLocaleString("pt-BR")} linhas · conteúdo pronto para análise</span>
                            </div>
                            <button
                              type="button"
                              className="icon-button remove-file"
                              aria-label="Remover arquivo selecionado"
                              onClick={() => { setFilename(""); setSource(""); setAnalysis(null); }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="upload-icon"><Upload size={22} /></div>
                            <strong>Arraste seu arquivo até aqui</strong>
                            <span>ou <button className="browse-button" type="button" onClick={() => fileInput.current?.click()}>escolha no computador</button></span>
                            <small>Python, JavaScript, TypeScript, JSON e mais</small>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="code-editor">
                        <div className="editor-topbar">
                          <div className="editor-dots"><i /><i /><i /></div>
                          <input
                            className="filename-input"
                            aria-label="Nome do arquivo"
                            value={filename}
                            onChange={(event) => setFilename(event.target.value)}
                            placeholder="nome-do-arquivo.py"
                            maxLength={120}
                          />
                          <span className="editor-language">{filename.split(".").pop()?.toUpperCase() || "CODE"}</span>
                        </div>
                        <div className="editor-body">
                          <div className="line-gutter" aria-hidden="true">
                            {Array.from({ length: Math.max(10, source.split(/\r?\n/).length) }, (_, index) => (
                              <span key={index}>{index + 1}</span>
                            ))}
                          </div>
                          <textarea
                            value={source}
                            onChange={(event) => setSource(event.target.value)}
                            placeholder={"# Cole seu código aqui\n\n# Você também pode carregar um dos exemplos vulneráveis"}
                            aria-label="Código fonte para análise"
                            spellCheck={false}
                            maxLength={1_000_000}
                          />
                        </div>
                        <div className="editor-footer">
                          <span><span className="editor-live-dot" /> {guestMode || !isApiConfigured() ? "LOCAL · NENHUM ENVIO" : "API · CÓDIGO ENVIADO"}</span>
                          <span>{source.length.toLocaleString("pt-BR")} / 1.000.000 caracteres</span>
                        </div>
                      </div>
                    )}

                    {error && <div className="error-notice" role="alert"><AlertTriangle size={15} /> {error}</div>}

                    <div className="scan-controls">
                      <span className="scan-note"><Shield size={14} /> {guestMode || !isApiConfigured() ? "Seu código permanece neste dispositivo." : "Seu código será enviado à API configurada."}</span>
                      <button className="btn button-primary scan-button" type="submit" disabled={isScanning}>
                        {isScanning ? <><RefreshCw size={16} className="spin" /> Analisando</> : <><ScanLine size={16} /> Iniciar análise <ArrowRight size={15} /></>}
                      </button>
                    </div>
                  </form>

                  <div className="demo-divider"><span>OU EXPERIMENTE COM UM EXEMPLO</span></div>
                  <div className="demo-buttons">
                    <button type="button" onClick={() => useDemo("python")}><span className="language-icon python-icon">Py</span> Exemplo Python <ArrowUpRight size={13} /></button>
                    <button type="button" onClick={() => useDemo("javascript")}><span className="language-icon js-icon">JS</span> Exemplo JavaScript <ArrowUpRight size={13} /></button>
                  </div>
                </div>

                </div>
                <div className="col-12 col-xl-4">
                <aside className="side-insights">
                  <div className="insight-card score-card">
                    <div className="insight-heading"><span>POSTURA DE SEGURANÇA</span><Activity size={15} /></div>
                    <div className="score-display">
                      <div className={`score-ring ${latestScan && scoreFor(latestScan) < 50 ? "score-risk" : ""}`}>
                        <span>{latestScan ? scoreFor(latestScan) : "—"}</span>
                        {latestScan && <small>/100</small>}
                      </div>
                      <div className="score-explainer">
                        <strong>{latestScan ? "Último resultado" : "Pronto para começar"}</strong>
                        <span>{latestScan ? `${findingOccurrences(latestScan)} achado(s) detectado(s)` : "Sua análise aparecerá aqui"}</span>
                      </div>
                    </div>
                    <div className="mini-meter"><span style={{ width: `${latestScan ? scoreFor(latestScan) : 0}%` }} /></div>
                    <div className="score-range"><span>RISCO ALTO</span><span>MAIS SEGURO</span></div>
                  </div>

                  <div className="insight-card quick-card">
                    <div className="insight-heading"><span>BASE DE VERIFICAÇÃO</span><Radar size={15} /></div>
                    <div className="quick-rule-list">
                      <div><span className="quick-icon"><Bug size={14} /></span><span>Injeção e execução</span><Check size={14} /></div>
                      <div><span className="quick-icon"><LockKeyhole size={14} /></span><span>Segredos e autenticação</span><Check size={14} /></div>
                      <div><span className="quick-icon"><Layers3 size={14} /></span><span>OWASP Top 10:2025</span><Check size={14} /></div>
                    </div>
                    <button className="text-link" type="button" onClick={() => setView("coverage")}>Ver mapa OWASP completo <ArrowRight size={13} /></button>
                  </div>

                  <div className="privacy-note">
                    <span className="privacy-note-icon"><LockKeyhole size={15} /></span>
                    <p><strong>{guestMode || !isApiConfigured() ? "Análise local" : "Análise via API"}</strong><br />{guestMode || !isApiConfigured()
                      ? "O código é analisado no navegador e não é enviado ao servidor."
                      : apiStatus === "online"
                        ? "Ao iniciar a análise, o código será enviado à API configurada."
                        : "A API não está respondendo; análises da conta podem falhar. Visitantes continuam no modo local."}</p>
                  </div>
                </aside>
                </div>
              </section>

              {isScanning && (
                <section className="scan-progress-card" aria-live="polite">
                  <div className="progress-main">
                    <div className="progress-orb"><Radar size={22} /></div>
                    <div className="progress-copy">
                      <span className="eyebrow">ANÁLISE EM ANDAMENTO</span>
                      <h3>{scanStages[Math.max(stage, 0)].title}</h3>
                      <p>{scanStages[Math.max(stage, 0)].detail}</p>
                    </div>
                    <span className="progress-percent">{Math.min(96, (stage + 1) * 24)}%</span>
                  </div>
                  <div className="progress-track"><span style={{ width: `${Math.min(96, (stage + 1) * 24)}%` }} /></div>
                  <div className="progress-steps">
                    {scanStages.map((scanStage, index) => {
                      const StageIcon = scanStage.icon;
                      return (
                        <span className={index < stage ? "stage-complete" : index === stage ? "stage-current" : ""} key={scanStage.title}>
                          {index < stage ? <Check size={13} /> : <StageIcon size={13} />}
                          {scanStage.title}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}

              {analysis && (
                <section className="results-section" ref={resultsRef}>
                  <div className="results-heading">
                    <div>
                      <div className="eyebrow"><span className="results-pulse" /> SCAN CONCLUÍDO · {analysis.durationMs} MS</div>
                      <h2>Relatório de análise</h2>
                      <p>{analysis.filename} <span>·</span> {analysis.linesAnalyzed.toLocaleString("pt-BR")} linhas <span>·</span> {analysis.language}</p>
                    </div>
                    <button className="btn button-primary pdf-button" type="button" disabled={isDownloadingReport} onClick={() => void exportReport(analysis)}>
                      {isDownloadingReport ? <RefreshCw size={16} className="spin" /> : <FileDown size={16} />}
                      {isDownloadingReport ? "Gerando relatório..." : "Baixar relatório PDF"}
                    </button>
                  </div>
                  {reportError && <div className="error-notice" role="alert"><AlertTriangle size={15} /> {reportError}</div>}
                  <div className="result-kpis">
                    <div className="result-kpi result-total"><span>ACHADOS</span><strong>{counts.occurrences}</strong><small>{analysis.findings.length} categorias</small></div>
                    <div className="result-kpi result-critical"><span>CRÍTICOS</span><strong>{counts.critical}</strong><small>correção imediata</small></div>
                    <div className="result-kpi result-high"><span>ALTOS</span><strong>{counts.high}</strong><small>prioridade alta</small></div>
                    <div className="result-kpi result-score"><span>ÍNDICE</span><strong>{currentScore}<small>/100</small></strong><small>heurística demonstrativa</small></div>
                  </div>
                  <div className="findings-panel">
                    <div className="findings-toolbar">
                      <div><h3>Achados prioritários</h3><span>{counts.occurrences} ocorrência(s) em {analysis.findings.length} categoria(s)</span></div>
                      <div className="filter-tabs" aria-label="Filtrar por severidade">
                        {["Todas", "Crítica", "Alta", "Média"].map((severity) => (
                          <button className={filter === severity ? "active" : ""} type="button" key={severity} onClick={() => setFilter(severity)}>
                            {severity}{severity === "Todas" ? ` · ${analysis.findings.length}` : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                    {analysis.findings.length ? (
                      <div className="finding-list">
                        {filteredFindings.map((finding) => (
                          <FindingRow finding={finding} filename={analysis.filename} key={finding.id} />
                        ))}
                        {filteredFindings.length === 0 && <div className="no-findings">Nenhum achado com essa severidade.</div>}
                      </div>
                    ) : (
                      <div className="clean-result"><BadgeCheck size={29} /><strong>Nenhum padrão sinalizado</strong><span>As regras desta versão não encontraram correspondências. Isso não comprova que o código esteja livre de vulnerabilidades.</span></div>
                    )}
                    <div className="findings-footer"><AlertTriangle size={14} /> Resultados heurísticos — confirme cada achado no contexto do projeto.</div>
                  </div>
                  <div className="owasp-mini-map">
                    <div><div className="eyebrow">REFERÊNCIA DE SEGURANÇA</div><h3>Como os achados se conectam ao OWASP</h3><p>Veja a classificação completa e o que cada categoria pode ou não verificar automaticamente.</p></div>
                    <button className="btn button-secondary" type="button" onClick={() => setView("coverage")}>Abrir mapa OWASP <ArrowRight size={14} /></button>
                    <div className="mini-category-row">
                      {owaspCategories.map((category) => {
                        const hasFinding = analysis.findings.some((finding) => finding.owaspId === category.id);
                        return <span className={hasFinding ? "category-flagged" : ""} key={category.id} title={`${category.id}:2025 · ${category.title}`}>{category.id}</span>;
                      })}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {view === "coverage" && (
            <OwaspPanel findings={analysis?.findings ?? []} onBack={() => setView("scanner")} />
          )}

          {view === "history" && (
            <section className="workspace-card history-section">
              <div className="section-heading-row">
                <div>
                  <div className="eyebrow">{!guestMode && isApiConfigured() ? "HISTÓRICO DA CONTA" : "SEUS DADOS, NESTE DISPOSITIVO"}</div>
                  <h2>Histórico de análises</h2>
                  <p>{!guestMode && isApiConfigured() ? "As análises ficam no histórico da sua conta, armazenado pela API configurada." : "As análises são armazenadas localmente neste navegador."}</p>
                </div>
                {history.length > 0 && <button className="btn button-secondary danger-button" type="button" onClick={() => void clearHistory()}><X size={14} /> Limpar histórico</button>}
              </div>
              {error && <div className="error-notice" role="alert"><AlertTriangle size={15} /> {error}</div>}
              {reportError && <div className="error-notice" role="alert"><AlertTriangle size={15} /> {reportError}</div>}
              {!historyLoaded ? (
                <div className="history-empty"><RefreshCw className="spin" size={20} /><span>Carregando seu histórico...</span></div>
              ) : history.length ? (
                <div className="history-list">
                  {history.map((item) => (
                    <article className="history-item" key={item.id}>
                      <IconBadge tone={findingOccurrences(item) ? "red" : "lime"}>{findingOccurrences(item) ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}</IconBadge>
                      <div className="history-item-main">
                        <strong>{item.filename}</strong>
                        <span>{item.language} <i /> {new Date(item.createdAt).toLocaleString("pt-BR")} <i /> {item.linesAnalyzed.toLocaleString("pt-BR")} linhas</span>
                      </div>
                      <span className="history-findings">{findingOccurrences(item)} achados</span>
                      <button className="text-link" type="button" onClick={() => { setAnalysis(item); setView("scanner"); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 80); }}>Ver relatório <ArrowRight size={13} /></button>
                      <button className="icon-button history-download" aria-label={`Baixar relatório de ${item.filename}`} disabled={isDownloadingReport} type="button" onClick={() => void exportReport(item)}>{isDownloadingReport ? <RefreshCw size={15} className="spin" /> : <FileDown size={16} />}</button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="history-empty">
                  <div className="history-empty-icon"><Clock3 size={22} /></div>
                  <strong>Seu histórico começa aqui</strong>
                  <span>Quando você fizer uma análise, os resultados aparecerão nesta lista.</span>
                  <button className="btn button-primary" type="button" onClick={() => setView("scanner")}>Fazer primeira análise <ArrowRight size={14} /></button>
                </div>
              )}
            </section>
          )}

          <footer className="app-footer">
            <span><Logo /> <span className="footer-copy">Security clarity for every commit.</span></span>
            <span>Frontend demonstrativo · <a href="https://top10.owasp.org/2025/" target="_blank" rel="noreferrer">OWASP Top 10:2025</a> <ArrowUpRight size={12} /></span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
