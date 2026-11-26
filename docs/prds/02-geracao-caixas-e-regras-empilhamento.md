# PRD 02 — Geração Randômica de Caixas e Regras de Empilhamento

**Módulo:** Domínio Logístico (`src/domain/`)  
**Prioridade:** P0 (Obrigatório pelo enunciado)

---

## 1. Objetivo

Implementar o motor procedural e de regras de negócio que gera caixas com dimensões aleatórias (sem modelos estáticos), atribui automaticamente sua cor com base no volume e valida se uma caixa pode ou não ser empilhada em determinada posição 3D.

---

## 2. Requisitos Funcionais

### RF-02.1 — Geração Randômica de Dimensões
- Cada nova caixa é gerada dinamicamente com:
  - Largura $w \in [w_{\min}, w_{\max}]$
  - Altura $h \in [h_{\min}, h_{\max}]$
  - Profundidade $d \in [d_{\min}, d_{\max}]$
- Os valores são arredondados para precisão prática (ex.: centímetros / `0.01 m`) para facilitar leitura pelo operador no HUD.
- O gerador aceita uma função `rng: () => number` opcional (padrão `Math.random`), permitindo testes 100% determinísticos.

### RF-02.2 — Cálculo de Volume e Classificação por Cor
- Volume: $V = w \times h \times d$ (em $\text{m}^3$, também exibível em litros $V \times 1000$).
- Limiares configuráveis $Y < X$ (`volumeThresholds: { y, x }`):
  - **Vermelho (`red`, tier 3):** $V > X$
  - **Verde (`green`, tier 2):** $Y < V \le X$
  - **Azul (`blue`, tier 1):** $V \le Y$
- Validação de configuração: garantir que $0 < Y < X$.

### RF-02.3 — Regra de Hierarquia de Cores no Empilhamento
- Uma caixa pode ser empilhada diretamente sobre:
  - O piso/base do container (palete ou caçamba): **sempre permitido** para qualquer cor.
  - Outra caixa de categoria `below`: permitido **se e somente se** `tier(above) <= tier(below)`:
    - Vermelho sobre Vermelho -> **Permitido**
    - Vermelho sobre Verde -> **Proibido** (`INVALID_COLOR_STACK`)
    - Vermelho sobre Azul -> **Proibido** (`INVALID_COLOR_STACK`)
    - Verde sobre Vermelho -> **Permitido**
    - Verde sobre Verde -> **Permitido**
    - Verde sobre Azul -> **Proibido** (`INVALID_COLOR_STACK`)
    - Azul sobre Vermelho -> **Permitido**
    - Azul sobre Verde -> **Permitido**
    - Azul sobre Azul -> **Permitido**
- Se a nova caixa apoiar-se simultaneamente sobre múltiplas caixas de apoio na mesma altura, **todas** as caixas de apoio devem satisfazer `tier(above) <= tier(below)`.

### RF-02.4 — Validação Geométrica (Container, Colisão e Suporte)
A função `validatePlacement(candidate, placedBoxes, containerBounds)` deve retornar um objeto estruturado `PlacementValidation`:
- `valid: boolean`
- `reasons: PlacementErrorCode[]` (lista de todas as violações detectadas)
- `conflictingBoxIds: string[]` (IDs das caixas que causaram conflito de cor ou colisão, para destaque visual no 3D!)
- `supportingBoxIds: string[]` (IDs das caixas sob a face inferior)
- `supportRatio: number` (fração $[0, 1]$ da área da base da caixa apoiada)

Códigos de erro suportados:
1. `OUT_OF_BOUNDS_X` / `OUT_OF_BOUNDS_Z` — caixa extrapola largura ou profundidade do container.
2. `EXCEEDS_MAX_HEIGHT` — topo da caixa ultrapassa altura máxima permitida.
3. `COLLISION` — interpenetração 3D (AABB) com caixa já posicionada (com tolerância numérica `EPSILON`).
4. `INSUFFICIENT_SUPPORT` — caixa acima do piso ($y_{\text{base}} > \varepsilon$) sem área de apoio suficiente (ex.: $< 60\%$).
5. `INVALID_COLOR_STACK` — violação da regra de cores/volume sobre uma ou mais caixas de apoio.

### RF-02.5 — Cálculo de Métricas de Cubagem
- Calcular a partir da lista de caixas alocadas e dos limites do container:
  - Volume total do container ($V_{\text{container}} = W \cdot H \cdot D$)
  - Volume ocupado ($V_{\text{ocupado}} = \sum V_i$)
  - Taxa de cubagem / ocupação ($\frac{V_{\text{ocupado}}}{V_{\text{container}}} \times 100\%$)
  - Contagem de caixas por cor (`red`, `green`, `blue`) e total

---

## 3. Critérios de Aceite

- [ ] Nenhuma caixa usa dimensões fixas/hardcoded ou arquivo `.glb`/`.obj` estático.
- [ ] Todas as combinações $3 \times 3$ da matriz de empilhamento por cor estão cobertas por testes unitários passando.
- [ ] Casos de fronteira ($V = X$, $V = Y$, colisão tangente vs interpenetração real, apoio parcial) têm testes unitários determinísticos.
- [ ] Em caso de recusa, o retorno identifica os `conflictingBoxIds` exatos para a camada 3D destacar o problema.
