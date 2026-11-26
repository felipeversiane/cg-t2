# Roadmap de Desenvolvimento

Acompanhamento de implementação de todas as fases do projeto.

---

## Fase 0 — Setup e Fundação (Concluída)

- [x] Conversão do enunciado original (`enunciado-trabalho.odt` -> `docs/enunciado.md`)
- [x] Criação do PRD Master (`docs/PRD.md`) e PRDs modulares (`docs/prds/01..04`)
- [x] Definição da arquitetura técnica (`docs/ARCHITECTURE.md`)
- [x] Inicialização do projeto Vite + TypeScript + Three.js + WebXR Device API + HTTPS local
- [x] Implementação do domínio puro (`box-generator`, `stacking-rules`) + testes com Vitest
- [x] Inicialização do repositório Git com `.gitignore` configurado

---

## Fase 1 — WebXR Real + Hit Testing + Simulador Desktop (Concluída)

- [x] Inicialização de sessão `immersive-ar` com `hit-test` obrigatório e `dom-overlay`
- [x] Ciclo de vida limpo do `XRHitTestSource` e retículo 3D animado
- [x] Proteção `beforexrselect` no HUD para evitar cliques fantasma em AR
- [x] Modo Simulador 3D Desktop completo (`OrbitControls` + raycast de mira pelo mouse + atalhos de teclado)
- [x] Script `npm run dev:tunnel` com `allowedHosts: true` para rodar no celular via `ngrok` ou `adb reverse`

---

## Fase 2 — Módulo A: Cubagem Virtual em Palete (Concluída)

- [x] Palete 3D procedural (tábuas ripadas, longarinas, base e guia de altura máxima)
- [x] Ancoragem do palete na superfície real detectada via Hit Testing (+ botão Reposicionar)
- [x] *Ghost preview* translúcido seguindo a mira sobre o palete e sobre caixas já empilhadas
- [x] Validação em tempo real (regra de cor, suporte mínimo, AABB e limites) com destaque de conflito
- [x] Controles no HUD: Girar 90°, Sortear Nova, Desfazer, Limpar e métricas de cubagem ao vivo

---

## Fase 3 — Módulo B: Picking Guiado e Caçamba de Caminhão (Concluída)

- [x] Caçamba de caminhão 3D procedural (piso, paredes semitransparentes, para-choque e gabarito superior)
- [x] 6 zonas/marcadores espaciais (`Z1`–`Z6`) identificados com etiquetas procedurais no piso
- [x] Detecção em tempo real da zona/posição alvo sob a mira
- [x] Destaque visual inequívoco quando não for possível empilhar:
  - *Ghost box* vermelho pulsante + badge 3D `✕ BLOQUEADO`
  - Destaque pulsante nas caixas causadoras do conflito (regra de cor ou colisão)
  - Destaque pulsante no teto (estouro de altura) e nas paredes (limites laterais)
  - Alerta diagnóstico detalhado no HUD + vibração háptica no celular
- [x] Guia de picking destacando em verde pulsante as zonas alternativas válidas + botão *Simular Carga*

---

## Fase 4 — Validação em Dispositivo e Entrega Final

- [x] Suíte de testes unitários cobrindo domínio, zonas da caçamba e mensagens diagnósticas
- [x] Build de produção e checagem TypeScript estrita passando sem erros
- [ ] Testar ao vivo no celular Android (ARCore) via `ngrok` ou `adb reverse` antes da apresentação
- [ ] Publicar repositório no GitHub e conferir URL final
