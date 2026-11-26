# PRD 01 — Sessão WebXR e Hit Testing

**Módulo:** Infraestrutura XR (`src/xr/`, `src/scene/reticle.ts`)  
**Prioridade:** P0 (Obrigatório pelo enunciado)

---

## 1. Objetivo

Estabelecer uma sessão de Realidade Aumentada usando exclusivamente a **WebXR Device API** (`immersive-ar`) integrada ao `THREE.WebGLRenderer`, permitindo detectar superfícies físicas reais (chão, mesas, paletes físicos) por meio de **Hit Testing** e ancorar objetos virtuais com estabilidade.

---

## 2. Requisitos Funcionais

### RF-01.1 — Verificação de Suporte WebXR
- Verificar na inicialização se `navigator.xr` existe e se `navigator.xr.isSessionSupported('immersive-ar')` retorna `true`.
- Exibir claramente o status na tela inicial:
  - **AR Disponível:** botão primário *"Iniciar Realidade Aumentada"*.
  - **AR Indisponível:** aviso informativo (explicando requisitos: Android Chrome + ARCore + HTTPS ou Immersive Web Emulator) + botão secundário *"Abrir Modo Simulador 3D"*.

### RF-01.2 — Inicialização de Sessão `immersive-ar`
- Solicitar sessão via `navigator.xr.requestSession('immersive-ar', options)` com:
  - `requiredFeatures: ['hit-test']`
  - `optionalFeatures: ['dom-overlay', 'anchors', 'local-floor']`
  - `domOverlay: { root: hudOverlayElement }`
- Configurar `renderer.xr.enabled = true` e `renderer.xr.setReferenceSpaceType('local')`.
- Encerrar sessão de forma limpa (`session.end()`), restaurando estado do HUD e liberando `XRHitTestSource`.

### RF-01.3 — Detecção de Superfícies (Hit Testing)
- Ao iniciar a sessão, obter `viewer` reference space (`session.requestReferenceSpace('viewer')`) e solicitar `hitTestSource = await session.requestHitTestSource({ space: viewerSpace })`.
- A cada frame (`renderer.setAnimationLoop(onXRFrame)`):
  - Executar `frame.getHitTestResults(hitTestSource)`.
  - Quando houver resultado válido, obter `hit.getPose(referenceSpace)` e atualizar a matriz do **Retículo 3D** (`reticle.matrix.fromArray(pose.transform.matrix)`).
  - Quando não houver superfície detectada, ocultar o retículo e exibir dica discreta no HUD (*"Movimente a câmera lentamente apontando para o chão ou mesa"*).

### RF-01.4 — Interação por Seleção (`select`)
- Registrar listener no controller XR (`renderer.xr.getController(0).addEventListener('select', onSelect)`) e/ou `session.addEventListener('select', ...)`.
- Garantir que toques em botões do `dom-overlay` **não** disparem acidentalmente o evento `select` de posicionamento/empilhamento na cena 3D (usando `beforexrselect` com `event.preventDefault()` nos controles interativos do HUD!).

### RF-01.5 — Modo Simulador Desktop (Desenvolvimento / Fallback)
- Quando não estiver em sessão WebXR ativa, permitir simular o plano do chão/mesa via `THREE.Raycaster` apontado pelo mouse e câmera 3D interativa.
- O simulador deve acionar **exatamente os mesmos** módulos de domínio e cena (palete, caçamba, empilhamento e alertas).

---

## 3. Critérios de Aceite

- [ ] A aplicação inicia sessão `immersive-ar` sem erros em dispositivo compatível ou Immersive Web Emulator.
- [ ] Nenhuma biblioteca legada (WebVR, AR.js, ARToolkit) está presente nas dependências ou no código.
- [ ] O retículo 3D aparece colado ao plano detectado (mesa ou chão) e acompanha suavemente o movimento da câmera.
- [ ] Clicar em botões do HUD durante a sessão AR não empilha caixas indevidamente.
- [ ] Encerrar a sessão AR retorna à tela normal sem vazamento de memória nem erro no console.
