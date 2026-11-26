# Arquitetura Técnica

Este documento descreve a organização técnica do projeto **Sistema de Auxílio à Cubagem e Picking via WebXR**, projetado para manter baixo acoplamento entre lógica logística, API WebXR e renderização Three.js.

---

## 1. Princípios Arquiteturais

1. **Domínio Puro e Testável (`src/domain/`):** Toda a matemática de dimensões, cálculo de volume, classificação por cores ($X$ e $Y$), matriz de empilhamento, colisões AABB, verificação de suporte e limites do palete/caçamba vive em TypeScript puro, sem importar `three` nem APIs do DOM/XR. Isso permite validação rápida com `Vitest`.
2. **WebXR First-Class (`src/xr/`):** Integração direta com a **WebXR Device API** (`navigator.xr`, `immersive-ar`, `hit-test`, `dom-overlay`), sem abstrações legadas.
3. **Renderização Desacoplada (`src/scene/`):** Three.js atua como camada visual que reflete o estado do domínio (palete, caçamba, caixas empilhadas, *ghost preview*, retículo e alertas de erro).
4. **Módulos Independentes (`src/modules/`):** Módulo A (Cubagem em Palete) e Módulo B (Picking Guiado / Caçamba) compartilham a mesma engine de domínio e de cena, alternando contexto e regras de container de forma limpa.

---

## 2. Estrutura de Diretórios

```text
cg-t2/
├── enunciado-trabalho.odt      # Enunciado original fornecido
├── docs/
│   ├── enunciado.md            # Conversão fiel do enunciado para Markdown
│   ├── PRD.md                  # PRD Master do sistema
│   ├── ARCHITECTURE.md         # Este documento
│   ├── ROADMAP.md              # Plano de implementação por fases
│   └── prds/                   # PRDs detalhados por módulo
│       ├── 01-webxr-hit-testing.md
│       ├── 02-geracao-caixas-e-regras-empilhamento.md
│       ├── 03-modulo-cubagem-palete.md
│       └── 04-modulo-picking-cacamba.md
├── src/
│   ├── main.ts                 # Ponto de entrada e orquestração da aplicação
│   ├── styles/
│   │   └── main.css            # Estilos do HUD e DOM Overlay
│   ├── domain/
│   │   ├── types.ts            # Contratos de dados e tipos do domínio
│   │   ├── config.ts           # Parâmetros calibráveis (X, Y, palete, caçamba)
│   │   ├── box-generator.ts    # Geração randômica (w, h, d) e cor por volume
│   │   └── stacking-rules.ts   # Validação de empilhamento, AABB, limites e cubagem
│   ├── xr/
│   │   ├── xr-session.ts       # Ciclo de vida da sessão WebXR (immersive-ar)
│   │   └── hit-test.ts         # Gerenciamento do XRHitTestSource e poses
│   ├── scene/
│   │   ├── scene-manager.ts    # WebGLRenderer (xr.enabled), câmera, luzes e loop
│   │   ├── reticle.ts          # Retículo visual de detecção de superfície
│   │   └── box-mesh.ts         # Fábrica de meshes Three.js para caixas e previews
│   ├── modules/
│   │   ├── cubing/
│   │   │   └── pallet-module.ts     # Módulo A: Cubagem Virtual em Palete
│   │   └── picking/
│   │       └── truck-bed-module.ts  # Módulo B: Picking Guiado / Caçamba
│   └── ui/
│       └── hud.ts              # HUD interativo (compatível com WebXR dom-overlay)
└── tests/
    └── domain/
        ├── box-generator.test.ts
        └── stacking-rules.test.ts
```

---

## 3. Fluxo de Dados e Loop de Execução

```text
[Câmera / Sensores WebXR]
          │
          ▼
  XRFrame + XRHitTestSource  ──► Retículo 3D (pose no mundo real)
          │
          ▼
   Evento 'select' (toque/clique)
          │
          ├─► Se container (Palete / Caçamba) ainda não ancorado:
          │       Ancora container na pose do retículo
          │
          └─► Se container já ancorado:
                  Converte ponto alvo para coordenadas locais do container
                  │
                  ▼
          [Domain: validatePlacement(...)]
                  ├─► Regra de cor/volume (Vermelho / Verde / Azul)
                  ├─► Limites do container (X, Y, Z)
                  ├─► Colisão AABB com caixas existentes
                  └─► Área mínima de suporte abaixo da caixa
                  │
                  ├─► VÁLIDO: Instancia caixa 3D + atualiza métricas + sorteia próxima caixa
                  └─► INVÁLIDO: Destaca visualmente a falha (Módulo A/B) + exibe motivo no HUD
```

---

## 4. Sistema de Coordenadas e Unidades

- **Unidade padrão:** Metros (`1.0` no Three.js = `1 metro` no espaço físico WebXR).
- **Eixo Y positivo:** Para cima (padrão Three.js e WebXR).
- **Coordenadas locais do container (Palete / Caçamba):**
  - Origem $(0, 0, 0)$ no centro do piso interno do container.
  - Eixo $X \in [-W/2,\ +W/2]$ (largura).
  - Eixo $Z \in [-D/2,\ +D/2]$ (profundidade).
  - Eixo $Y \in [0,\ H_{\max}]$ (altura a partir da base do palete ou piso da caçamba).
  - Cada `PlacedBox` armazena `position` correspondendo ao **centro da base inferior** `(x, baseY, z)` ou centro geométrico — adotamos **centro geométrico** `(x, y, z)` com utilitários explícitos `getBoxBounds(box)` para manter compatibilidade direta com `THREE.Mesh.position`!

---

## 5. Estratégia de Execução e Testes em WebXR

1. **Smartphone Android com ARCore + Chrome (Cenário Alvo Principal):**
   - Rodar `npm run dev` (sobe servidor Vite com HTTPS via `@vitejs/plugin-basic-ssl` e `--host`).
   - Acessar pelo celular na mesma rede Wi-Fi (`https://<IP-LOCAL>:5173`) ou conectar via USB com `adb reverse tcp:5173 tcp:5173` e abrir `https://localhost:5173` no Chrome Android.
2. **Desktop com Immersive Web Emulator (IWER):**
   - Instalar a extensão **Immersive Web Emulator** no Chrome/Edge.
   - Selecionar perfil de dispositivo AR (ex.: smartphone/headset com AR) e testar `immersive-ar` e `hit-test` diretamente no navegador desktop.
3. **Desktop sem WebXR (Modo Simulador / Preview 3D):**
   - Quando `navigator.xr.isSessionSupported('immersive-ar')` retornar `false`, o sistema informa claramente que está em modo preview/simulador 3D e permite interagir com o chão virtual via raycasting do mouse para validar toda a lógica de cubagem e picking.
4. **Testes Automatizados:**
   - `npm test` executa a suíte `Vitest` validando regras de volume, cores, empilhamento, colisões e métricas de cubagem.
   - `npm run typecheck` valida rigorosamente o TypeScript (`tsc --noEmit`).
