# PRD 04 — Módulo B: Picking Guiado e Caçamba de Caminhão

**Módulo:** `src/modules/picking/truck-bed-module.ts`  
**Prioridade:** P0 (Funcionalidade Esperada B)

---

## 1. Objetivo

Simular uma **caçamba de caminhão** em Realidade Aumentada onde, ao detectar um marcador ou uma posição específica (zona/slot de alocação ou pilha alvo), o sistema avalia a caixa atual e **destaca visualmente de forma inequívoca quando NÃO for possível empilhar a caixa**, auxiliando o operador no *picking* e carregamento sem erro.

---

## 2. Interpretação e Modelagem do Cenário

O enunciado especifica:
> *"A aplicação deve simular uma caçamba de um caminhão. Ao detectar um marcador ou uma posição específica, o sistema deve destacar quando não for possível empilhar a caixa."*

Para atender ao requisito de forma moderna (sem ARToolkit/AR.js legado) e extremamente clara na demonstração:
1. **Caçamba 3D Procedural:**
   - Estrutura 3D representando a carroceria/caçamba de um caminhão em escala adequada para AR (ex.: $1{,}60\text{ m}$ comprimento $\times$ $0{,}90\text{ m}$ largura $\times$ $0{,}90\text{ m}$ altura útil — configurável em `src/domain/config.ts`).
   - Piso texturizado/demarcado em **zonas/slots de posição** (ex.: grade A1, A2, B1, B2...) com paredes laterais, dianteira e limite superior (teto/gabarito) semitransparentes para não obstruir a visão das caixas internas.
2. **Detecção de Marcador ou Posição Específica:**
   - **Posição específica via Hit Test / Raycast de Mira:** A caçamba possui **marcadores de posição / zonas de picking** no piso e no topo das pilhas existentes. Quando o usuário aponta a câmera para uma posição específica (ou posiciona um marcador virtual de inspeção via Hit Test), o sistema reconhece a posição alvo (`targetSlot` / `targetStack`).
   - **Carga pré-existente ou interativa:** A caçamba pode começar com algumas caixas de cenário (geradas randomicamente!) ou permitir empilhar interativamente, possibilitando testar imediatamente tanto posições válidas quanto posições inválidas (ex.: tentar colocar uma caixa Vermelha sobre uma pilha terminada em Azul, ou uma caixa que ultrapassa a altura da caçamba).
3. **Destaque Visual de Impossibilidade de Empilhamento (Foco Central do Módulo B):**
   Quando `validatePlacement(...)` retornar `valid === false` na posição detectada, o sistema deve acionar múltiplos sinais visuais coordenados:
   - **Ghost Box em Estado de Erro:** Cor vermelho-alerta intenso (`#ff1e42`) com opacidade pulsante, wireframe brilhante e ícone/sinalização de bloqueio (`X`) sobre a posição.
   - **Destaque da Causa Raiz na Cena 3D:**
     - Se `INVALID_COLOR_STACK`: destacar com contorno pulsante / emissivo a(s) caixa(s) de apoio que impedem o empilhamento (ex.: caixa Azul abaixo da caixa Vermelha).
     - Se `EXCEEDS_MAX_HEIGHT`: destacar o plano de teto/gabarito superior da caçamba em vermelho.
     - Se `OUT_OF_BOUNDS_X` ou `OUT_OF_BOUNDS_Z`: destacar a parede lateral/frontal violada.
     - Se `COLLISION`: destacar a(s) caixa(s) colidente(s).
     - Se `INSUFFICIENT_SUPPORT`: destacar a área sem apoio na base.
   - **Alerta Diagnóstico no HUD (`dom-overlay`):** Badge vermelho de alto contraste explicando objetivamente **por que não é possível empilhar** (ex.: *"BLOQUEADO: Caixa Vermelha (58 L) não pode ser empilhada sobre Caixa Verde (31 L)"* ou *"BLOQUEADO: Altura ultrapassa o limite da caçamba (0.90 m)"*).
   - **Guia de Picking / Alternativa:** Opcionalmente destacar em verde/ciano uma zona/slot alternativo válido na caçamba (ou item que precisa ser coletado/remanejado primeiro), fechando o ciclo de auxílio ao *picking*.

---

## 3. Requisitos Funcionais

- **RF-04.1:** Ancorar a caçamba do caminhão sobre a superfície real detectada via Hit Testing.
- **RF-04.2:** Exibir marcadores/zonas numeradas (ex.: `Z1`..`Z6`) na caçamba e detectar em tempo real qual posição/marcador está sob foco da câmera.
- **RF-04.3:** Permitir tanto empilhar novas caixas quanto pré-popular a caçamba com um carregamento inicial aleatório para demonstração rápida de cenários de conflito.
- **RF-04.4:** Destacar em tempo real na cena 3D e no HUD todas as situações em que a caixa atual **não** pode ser empilhada na posição detectada.
- **RF-04.5:** Bloquear efetivamente a inserção ao clicar/tocar em posição inválida (com feedback visual de recusa) e permitir a inserção quando a posição for válida.

---

## 4. Critérios de Aceite

- [ ] A caçamba de caminhão é renderizada com limites físicos claros (piso, paredes semitransparentes e limite de altura) ancorada via Hit Testing.
- [ ] Ao apontar para uma posição/marcador onde o empilhamento viola a regra de cores, altura, paredes, colisão ou suporte, o sistema destaca visualmente o bloqueio de forma imediata e inequívoca.
- [ ] O motivo específico do bloqueio é exibido claramente no HUD e refletido na cena 3D (destacando a caixa ou limite conflitante).
- [ ] Em posições válidas, o destaque indica permissão e o clique empilha a caixa corretamente.
