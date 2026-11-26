# Sistema de Auxílio à Cubagem e Picking via WebXR

> **Demo Online (HTTPS para WebXR no celular):** https://felipeversiane.github.io/cg-t2/

Aplicação de Realidade Aumentada (RA) baseada na Web utilizando **Three.js** e a **WebXR Device API** moderna para auxiliar operadores logísticos na visualização de **cubagem em paletes** e **picking guiado em caçamba de caminhão**, com geração randômica de caixas, classificação de cor por volume e validação de empilhamento em tempo real.

---

## Funcionalidades Implementadas

- **WebXR Device API + Hit Testing (`immersive-ar`):**
  - Detecção de superfícies reais (chão e mesas) via `XRHitTestSource` com retículo 3D animado.
  - Interface HUD sobreposta via `dom-overlay` com proteção `beforexrselect` contra toques acidentais.
  - **Modo Simulador 3D Desktop** automático (OrbitControls + raycasting pelo mouse) para demonstrar e testar 100% da aplicação no computador sem precisar de celular AR.
- **Interatividade Baseada em Dados (Sem Modelos Estáticos):**
  - Dimensões $(w, h, d)$ sorteadas randomicamente em metros e renderizadas proceduralmente com Three.js.
  - Cor definida pelo volume $V = w \cdot h \cdot d$ com regras estritas de empilhamento (Vermelho, Verde e Azul).
  - Controles de **Girar 90°**, **Sortear Nova Caixa**, **Desfazer**, **Limpar** e **Reposicionar**.
- **Módulo A — Cubagem Virtual (Palete):**
  - Palete 3D procedural ancorado sobre superfícies reais com *ghost preview* ao vivo, validação instantânea e métricas de taxa de cubagem (%), volume em litros e contagem por cor.
- **Módulo B — Picking Guiado (Caçamba de Caminhão):**
  - Caçamba 3D procedural com **6 zonas/marcadores identificados (`Z1`–`Z6`)** e botão **Simular Carga** para popular cenários randômicos.
  - Ao apontar para uma zona/posição onde **não é possível empilhar**, destaca visualmente o bloqueio com: *ghost box* vermelho pulsante + badge 3D `✕ BLOQUEADO`, destaque pulsante da caixa conflitante / teto / parede violada, alerta diagnóstico no HUD, vibração háptica no celular e sugestão em verde das zonas válidas alternativas.

---

## Documentação do Projeto

- [Enunciado Original (Markdown)](./docs/enunciado.md) — convertido a partir de `enunciado-trabalho.odt`
- [PRD Master](./docs/PRD.md) — visão geral, regras de negócio, critérios de aceite e riscos
- [Arquitetura Técnica](./docs/ARCHITECTURE.md) — organização dos módulos, coordenadas e fluxo WebXR
- [Roadmap de Implementação](./docs/ROADMAP.md) — progresso por fases
- PRDs Modulares:
  - [01 — Sessão WebXR e Hit Testing](./docs/prds/01-webxr-hit-testing.md)
  - [02 — Geração de Caixas e Regras de Empilhamento](./docs/prds/02-geracao-caixas-e-regras-empilhamento.md)
  - [03 — Módulo A: Cubagem Virtual em Palete](./docs/prds/03-modulo-cubagem-palete.md)
  - [04 — Módulo B: Picking Guiado e Caçamba de Caminhão](./docs/prds/04-modulo-picking-cacamba.md)

---

## Regras de Volume e Empilhamento

Cada caixa tem largura ($w$), altura ($h$) e profundidade ($d$) sorteadas dinamicamente. Seu volume $V = w \cdot h \cdot d$ define a cor (limiares configuráveis em `src/domain/config.ts`):

| Cor | Regra de Volume | Limiar Padrão | Pode ser empilhada sobre |
| :--- | :--- | :--- | :--- |
| **Vermelho** | $V > X$ | $> 42\text{ L}$ | Base ou Vermelho |
| **Verde** | $Y < V \le X$ | $20\text{ L} < V \le 42\text{ L}$ | Base, Vermelho ou Verde |
| **Azul** | $V \le Y$ | $\le 20\text{ L}$ | Base, Vermelho, Verde ou Azul |

---

## Como Executar e Rodar no Celular (Para Mostrar ao Professor)

### Instalação

```bash
npm install
```

### Opção 1 — Via `ngrok` (Mais recomendada para faculdade / 4G / zero erro de certificado)

A WebXR Device API exige **HTTPS com certificado confiável**. O **ngrok** cria um túnel HTTPS público com certificado válido apontando direto para o seu computador:

1. No terminal 1, inicie o servidor preparado para túnel:
   ```bash
   npm run dev:tunnel
   ```
2. No terminal 2, abra o túnel com o ngrok:
   ```bash
   ngrok http 5173
   ```
3. Abra o link `https://xxxx.ngrok-free.app` gerado pelo ngrok no **Google Chrome do celular Android** (com ARCore / Google Play Services para RA instalado) e toque em **Iniciar AR**.

### Opção 2 — Via Cabo USB (`adb reverse`, sem depender de Wi-Fi)

No Chrome Android, `http://localhost` é tratado como contexto seguro (permite WebXR sem certificado!):

1. Conecte o celular no computador via USB (com *Depuração USB* ativa) e rode:
   ```bash
   adb reverse tcp:5173 tcp:5173
   ```
2. Inicie o servidor:
   ```bash
   npm run dev:tunnel
   ```
3. Abra `http://localhost:5173` no Chrome do celular e toque em **Iniciar AR**.

### Opção 3 — Direto na Rede Wi-Fi Local (HTTPS autoassinado)

```bash
npm run dev
```

Acesse `https://<IP-LOCAL-DO-PC>:5173` no Chrome do celular e aceite o aviso de certificado autoassinado.

### No Desktop (Simulador 3D ou Emulador WebXR)

- **Simulador 3D integrado:** basta abrir no navegador (`npm run dev` ou `npm run dev:tunnel`), mover o mouse sobre o palete/caçamba, clicar para empilhar e arrastar para girar a câmera. Atalhos: `R` (girar 90°), `Z` (desfazer), `N` (nova caixa), `1`/`2` (trocar módulo).
- **Emulador WebXR:** instale a extensão **Immersive Web Emulator** no Chrome/Edge para testar a sessão `immersive-ar` e o `hit-test` no desktop.

---

## Scripts Disponíveis

| Script | Descrição |
| :--- | :--- |
| `npm run dev` | Sobe o servidor Vite com HTTPS local e `--host` (Wi-Fi LAN) |
| `npm run dev:tunnel` | Sobe o servidor Vite em HTTP na porta `5173` com `allowedHosts: true` (ideal para `ngrok http 5173` e `adb reverse`) |
| `npm run build` | Valida tipos (`tsc --noEmit`) e gera build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run typecheck` | Executa checagem estrita de tipos TypeScript |
| `npm test` | Executa os testes unitários com Vitest |
| `npm run test:watch` | Executa Vitest em modo watch |
