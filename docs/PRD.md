# PRD Master — Sistema de Auxílio à Cubagem e Picking via WebXR

**Status:** Planejamento / Setup Concluído  
**Disciplina:** Computação Gráfica (CG — T2)  
**Stack Principal:** TypeScript + Vite + Three.js + WebXR Device API  
**Documento de Origem:** [`docs/enunciado.md`](./enunciado.md)

---

## 1. Visão Geral do Produto

O **Sistema de Auxílio à Cubagem e Picking via WebXR** é uma aplicação web de Realidade Aumentada (RA) voltada para operações logísticas. Utilizando exclusivamente a **WebXR Device API** moderna em conjunto com **Three.js**, o sistema permite que um operador visualize em tempo real, sobre superfícies físicas detectadas pela câmera do dispositivo:

1. A **simulação de cubagem em paletes**, empilhando caixas geradas dinamicamente segundo regras de volume e cor;
2. A **simulação de carregamento/picking guiado em uma caçamba de caminhão**, destacando imediatamente situações em que uma caixa **não pode ser empilhada** ou alocada na posição alvo.

---

## 2. Problema e Motivação

Em centros de distribuição e docas de carregamento:
- A baixa eficiência de preenchimento volumétrico (*cubagem*) desperdiça espaço útil em paletes e caminhões, aumentando custos de frete.
- Erros de empilhamento (colocar caixas pesadas/grandes sobre caixas leves/pequenas) causam avarias e retrabalho.
- A consulta manual a planilhas ou listas externas reduz a produtividade durante o *picking* e o carregamento.

A sobreposição espacial via WebXR permite validação instantânea no campo de visão do operador, com feedback visual inequívoco (cores por volume, pré-visualização da próxima caixa, alertas de invalidez e indicadores de ocupação).

---

## 3. Objetivos e Critérios de Sucesso

| Objetivo | Critério de Verificação |
| :--- | :--- |
| Conformidade tecnológica | Uso exclusivo de **Three.js** + **WebXR Device API** (`immersive-ar`, `hit-test`, `dom-overlay`), sem bibliotecas legadas (WebVR, AR.js, ARToolkit, etc.). |
| Ancoragem em superfícies reais | Detecção contínua de superfícies via `XRHitTestSource` com retículo 3D estável em chão ou mesas. |
| Geração procedural de caixas | Dimensões $(w, h, d)$ sorteadas dinamicamente dentro de faixas realistas; nenhum modelo estático de caixa. |
| Classificação e regras de empilhamento | Cor atribuída estritamente pelo volume $V = w \cdot h \cdot d$ com validação rigorosa da hierarquia Vermelho / Verde / Azul. |
| Módulo A (Cubagem em Palete) | Posicionamento de palete virtual e empilhamento interativo de caixas ao toque/clique, com métricas de cubagem em tempo real. |
| Módulo B (Picking Guiado / Caçamba) | Simulação 3D de caçamba de caminhão com detecção de marcador/posição específica e destaque visual claro quando o empilhamento for inválido. |
| Testabilidade | Lógica de domínio coberta por testes automatizados + suporte a testes em dispositivo ARCore (HTTPS) e emulador WebXR / fallback desktop. |

---

## 4. Requisitos Funcionais (Resumo)

Cada frente de trabalho possui um PRD dedicado em `docs/prds/`:

1. **[PRD 01 — Sessão WebXR e Hit Testing](./prds/01-webxr-hit-testing.md)**
   - Detecção de suporte a `immersive-ar`.
   - Inicialização de sessão WebXR com `hit-test` e `dom-overlay`.
   - Retículo 3D sincronizado à superfície detectada.
   - Modo Simulador Desktop (fallback de desenvolvimento quando o dispositivo não suporta AR nativo, mantendo compatibilidade total com Immersive Web Emulator).
2. **[PRD 02 — Geração Randômica de Caixas e Regras de Empilhamento](./prds/02-geracao-caixas-e-regras-empilhamento.md)**
   - Geração aleatória de dimensões $(w, h, d)$ em metros.
   - Cálculo de volume $V = w \times h \times d$.
   - Classificação por cor segundo limiares $X$ e $Y$.
   - Validação combinada: regra de cores + suporte físico + colisão 3D (AABB) + limites do container.
3. **[PRD 03 — Módulo A: Cubagem Virtual em Palete](./prds/03-modulo-cubagem-palete.md)**
   - Ancoragem do palete vazio em superfície real.
   - Empilhamento de caixas ao clicar/tocar (`select`).
   - Pré-visualização (*ghost box*) indicando posição e validade.
   - Cálculo e exibição de volume ocupado, percentual de cubagem e contagem por categoria.
4. **[PRD 04 — Módulo B: Picking Guiado e Caçamba de Caminhão](./prds/04-modulo-picking-cacamba.md)**
   - Simulação 3D de caçamba de caminhão com delimitação espacial clara.
   - Detecção de marcador/posição específica (zona de picking/alocação na caçamba).
   - Destaque visual imediato (vermelho pulsante / contorno / mensagem diagnóstica) quando **não for possível empilhar a caixa**, informando exatamente o motivo da recusa.

---

## 5. Regras de Negócio Detalhadas

### 5.1 Classificação por Volume

Cada caixa possui dimensões reais em metros:
- Largura $w$, Altura $h$, Profundidade $d$
- Volume $V = w \times h \times d$ (em $\text{m}^3$)

Para eliminar ambiguidades de fronteira em $V = X$ e $V = Y$ (o enunciado define $V > X$, $Y < V < X$ e $V < Y$), adotamos a partição contínua e determinística:

| Categoria | Cor | Condição de Volume | Nível (Tier) | Interpretação Logística |
| :--- | :--- | :--- | :---: | :--- |
| `red` | Vermelho (`#ef4444`) | $V > X$ | 3 | Carga grande / base estrutural |
| `green` | Verde (`#22c55e`) | $Y < V \le X$ | 2 | Carga média / intermediária |
| `blue` | Azul (`#3b82f6`) | $V \le Y$ | 1 | Carga pequena / leve (topo) |

> **Escala padrão calibrada para mesas e pisos em WebXR** (escala realista ou escala de demonstração configurável em `src/domain/config.ts`):
> - Dimensões das caixas sorteadas em $[0{,}15\text{ m},\ 0{,}45\text{ m}]$ por eixo (volume entre $0{,}003375\text{ m}^3$ e $0{,}091125\text{ m}^3$).
> - Limiares padrão: $Y = 0{,}020\text{ m}^3$ ($20\text{ L}$) e $X = 0{,}045\text{ m}^3$ ($45\text{ L}$).
> - Isso garante boa distribuição probabilística entre caixas azuis, verdes e vermelhas e excelente visibilidade em testes tanto em mesa quanto no chão!

### 5.2 Matriz de Empilhamento Permitido

Uma caixa superior ($C_{\text{topo}}$) pode ser empilhada sobre uma caixa de apoio ($C_{\text{base}}$) **se e somente se**:

$$\text{tier}(C_{\text{topo}}) \le \text{tier}(C_{\text{base}})$$

| Caixa de Cima \ Caixa de Baixo | Base (Palete / Piso) | Vermelho (Tier 3) | Verde (Tier 2) | Azul (Tier 1) |
| :--- | :---: | :---: | :---: | :---: |
| **Vermelho (Tier 3)** | Permitido | Permitido | **Proibido** | **Proibido** |
| **Verde (Tier 2)** | Permitido | Permitido | Permitido | **Proibido** |
| **Azul (Tier 1)** | Permitido | Permitido | Permitido | Permitido |

### 5.3 Restrições Geométricas Adicionais

Além da regra de cores, uma alocação só é válida se:
1. **Sem interpenetração (AABB):** A nova caixa não colide com nenhuma caixa já alocada.
2. **Dentro dos limites horizontais e de altura:** A caixa permanece contida na área útil do palete (Módulo A) ou no volume interno da caçamba (Módulo B).
3. **Apoio suficiente:** Quando acima do piso ($y > 0$), a face inferior da caixa deve ter área de contato/suporte mínima (ex.: $\ge 60\%$ da área da base) sobre caixas que satisfaçam a regra de cor naquela cota $y$, evitando caixas "flutuando" no ar.

---

## 6. Requisitos Não-Funcionais

- **Performance:** Manter taxa alvo de 60 FPS em dispositivos móveis intermediários (geometrias leves, reuso de materiais, sem alocações desnecessárias no loop `setAnimationLoop`).
- **Contexto Seguro (HTTPS):** Servidor de desenvolvimento servido via HTTPS por padrão para habilitar WebXR em Android Chrome na rede local.
- **Usabilidade em AR:** HUD minimalista sobreposto via `dom-overlay`, com contraste adequado sobre o feed real da câmera e botões acessíveis com uma mão.
- **Manutenibilidade:** Separação clara entre regras puras de domínio (`src/domain/`), infraestrutura WebXR (`src/xr/`), renderização Three.js (`src/scene/`) e módulos funcionais (`src/modules/`).

---

## 7. Restrições e O Que Está Fora de Escopo

### Restrições Obrigatórias
- **Proibido** usar soluções legadas (WebVR, AR.js, ARToolkit, Vuforia, bibliotecas obsoletas).
- **Obrigatório** usar Three.js + WebXR Device API.
- **Proibido** usar modelos 3D estáticos pré-fabricados para as caixas.

### Fora de Escopo (MVP)
- Integração com backend/WMS externo ou banco de dados remoto.
- Otimizador automático completo de *3D Bin Packing* (NP-difícil) com rotação livre de 6 graus — o foco é visualização e validação interativa guiada em AR (sugestão de slot ótimo pode entrar como bônus futuro).
- Persistência em nuvem de sessões de carregamento.

---

## 8. Riscos e Estratégias de Mitigação

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Falta de celular compatível com ARCore durante o desenvolvimento | Alto | Usar extensão **Immersive Web Emulator (IWER)** no Chrome/Edge + **Modo Simulador Desktop** desacoplado para validar toda a lógica 3D. |
| WebXR bloqueado por HTTP inseguro na rede local | Alto | Configurar `@vitejs/plugin-basic-ssl` no `vite.config.ts` e documentar teste via `adb reverse` / HTTPS local. |
| Deriva de tracking ou instabilidade do Hit Test | Médio | Fixar a pose do palete/caçamba ao ancorar (usando `XRAnchor` quando disponível ou matriz congelada no espaço `local-floor`/`local`). |
| Caixas saindo do campo visual por escala inadequada | Médio | Centralizar todas as dimensões em `src/domain/config.ts` em metros reais com ajuste simples de escala. |
