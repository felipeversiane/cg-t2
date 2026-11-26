# Enunciado do Projeto: Sistema de Auxílio à Cubagem e Picking via WebXR

> Documento convertido fielmente a partir de `enunciado-trabalho.odt`.

## 1. Objetivo

Desenvolver uma aplicação de Realidade Aumentada (RA) baseada na Web (WebXR) utilizando a biblioteca **Three.js**. O sistema deve auxiliar operadores de logística a visualizar o preenchimento de espaços (cubagem) e identificar itens em prateleiras através de sobreposição digital de dados.

## 2. Contexto do Problema

Em centros de distribuição, o erro humano na escolha de produtos (*picking*) e a má utilização do volume em paletes geram custos elevados. A aplicação deve resolver isso permitindo que o usuário "veja" onde cada caixa deve ser alocada ou qual item deve ser coletado sem consultar tabelas externas.

---

## 3. Requisitos Técnicos (Obrigatórios)

- **Tecnologia:** Uso obrigatório de **Three.js** e a API **WebXR Device API**. *(NÃO USAR SOLUÇÕES LEGADAS)*
- **Hit Testing:** Implementação de detecção de superfícies reais para posicionar objetos virtuais (caixas/paletes) de forma estável no chão ou mesas.
- **Interatividade Baseada em Dados:** A aplicação não deve ter modelos estáticos. Os objetos (dimensões das caixas) devem ser gerados randomicamente, utilizando largura, altura e profundidade. O volume da caixa definirá sua cor:
  - **Vermelho:** $V > X$
  - **Verde:** $Y < V < X$
  - **Azul:** $V < Y$
  - **Regras de empilhamento:**
    - Caixas podem ser empilhadas em caixas da mesma cor.
    - Caixas **azuis** podem ser inseridas acima de caixas **verdes** ou **vermelhas**.
    - Caixas **verdes** podem ser inseridas acima de caixas **vermelhas**.

---

## 4. Funcionalidades Esperadas

### A. Módulo de Cubagem Virtual (Simulação de Carga)

O aluno deve implementar uma funcionalidade onde o usuário aponta a câmera para um palete vazio e, ao clicar, "empilha" virtualmente as caixas.

### B. Módulo de Picking Guiado

A aplicação deve simular uma caçamba de um caminhão. Ao detectar um marcador ou uma posição específica, o sistema deve destacar quando não for possível empilhar a caixa.

---

## 5. Entregáveis

1. **Código Fonte:** Repositório no GitHub com o projeto configurado.
