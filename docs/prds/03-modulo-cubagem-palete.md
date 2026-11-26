# PRD 03 — Módulo A: Cubagem Virtual (Simulação de Carga em Palete)

**Módulo:** `src/modules/cubing/pallet-module.ts`  
**Prioridade:** P0 (Funcionalidade Esperada A)

---

## 1. Objetivo

Permitir que o operador aponte a câmera para uma superfície real (ou para um palete físico vazio), posicione o espaço virtual de cubagem de um palete e, ao clicar/tocar, empilhe virtualmente caixas geradas de forma aleatória, visualizando a ocupação volumétrica em tempo real.

---

## 2. Fluxo do Usuário

1. Usuário entra no modo **Cubagem (Palete)**.
2. **Etapa 1 — Posicionar Palete:**
   - O sistema exibe o retículo (e opcionalmente o contorno do palete em pré-visualização) sobre a superfície detectada via Hit Testing.
   - Ao tocar/clicar (`select`), o **palete virtual vazio** é ancorado na posição detectada (padrão PBR em escala real ou escala de bancada configurável, ex.: $1{,}20\text{ m} \times 1{,}00\text{ m}$ ou $0{,}80\text{ m} \times 0{,}60\text{ m}$).
3. **Etapa 2 — Empilhar Caixas:**
   - Uma caixa aleatória é sorteada e exibida no HUD (dimensões $w \times h \times d$, volume em litros e cor/categoria) e como *ghost preview* translúcido sobre o palete.
   - Conforme o operador aponta a câmera/mira sobre o palete (ou sobre o topo de caixas já colocadas), o sistema calcula automaticamente a altura de assentamento (`y`) e valida em tempo real se a posição é válida.
   - *Ghost preview* fica em tom suave/confirmado quando válido, ou vermelho/alerta quando inválido.
   - Ao tocar/clicar (`select`):
     - Se **válido**: a caixa é fixada na pilha, uma nova caixa é sorteada e as métricas de cubagem são atualizadas.
     - Se **inválido**: a caixa não é inserida e o HUD exibe feedback curto com o motivo (ex.: *"Caixa vermelha não pode ser empilhada sobre caixa azul"*).
4. **Ações Auxiliares no HUD:**
   - **Girar 90°** (troca $w \leftrightarrow d$ da caixa atual, auxiliando o encaixe na cubagem).
   - **Sortear outra / Pular caixa** (opcional) ou **Desfazer última caixa**.
   - **Limpar palete** (remove todas as caixas mantendo o palete ancorado).
   - **Reposicionar palete** (volta à Etapa 1).

---

## 3. Requisitos Visuais (Three.js)

- **Palete 3D procedural:** construído com geometrias `BoxGeometry` (tábuas superiores, longarinas e base) + contorno discreto da área útil e linhas pontilhadas/wireframe opcionais da altura máxima de empilhamento.
- **Caixas 3D procedurais:** `BoxGeometry(w, h, d)` com material PBR (`MeshStandardMaterial`) na cor da categoria (`red` / `green` / `blue`) + bordas (`EdgesGeometry` + `LineSegments`) para alta legibilidade espacial em AR.
- **Métricas no HUD:**
  - Taxa de cubagem (%) com barra de progresso.
  - Volume ocupado / volume máximo ($\text{L}$ ou $\text{m}^3$).
  - Contadores de caixas: Vermelhas, Verdes, Azuis e Total.

---

## 4. Critérios de Aceite

- [ ] Palete virtual é posicionado de forma estável em superfície detectada via Hit Testing.
- [ ] Clique/toque empilha caixas geradas dinamicamente respeitando rigorosamente as regras de cor/volume e limites do palete.
- [ ] Pré-visualização (*ghost box*) antecipa se a posição atual é válida antes do clique.
- [ ] Métricas de cubagem atualizam instantaneamente após cada empilhamento ou remoção.
- [ ] Operador pode rotacionar a caixa em 90°, desfazer a última inserção e reiniciar a carga.
